import { Injectable } from "@angular/core"
import { BehaviorSubject } from "rxjs"
import { first, tap } from "rxjs/operators"
import { BuildConfig } from "~type/proxy-server-types"

import { Balances, BlockchainMessageType, ContractInfo, CoreMessageType, DLCContract, DLCMessageType, DLCWalletAccounting, FundedAddress, GetInfoResponse, ServerResponse, ServerVersion, WalletMessageType } from "~type/wallet-server-types"
import { getMessageBody } from "~util/wallet-server-util"

import { MessageService } from "./message.service"


const MATCH_LEADING_DIGITS = /^([0-9]+) /

@Injectable({ providedIn: 'root' })
export class WalletStateService {

  serverVersion: string
  buildConfig: BuildConfig

  info: GetInfoResponse
  balances: Balances
  fundedAddresses: FundedAddress[]
  dlcWalletAccounting: DLCWalletAccounting
  feeEstimate: number
  torDLCHostAddress: string

  dlcs: BehaviorSubject<DLCContract[]> = new BehaviorSubject<DLCContract[]>([])
  contractInfos: BehaviorSubject<{ [dlcId: string]: ContractInfo }> = new BehaviorSubject<{ [dlcId: string]: ContractInfo }>({})

  constructor(private messageService: MessageService) {
    this.messageService.getServerVersion().subscribe(r => {
      if (r.result) {
        this.serverVersion = r.result.version;
      }
    })
    this.messageService.buildConfig().subscribe(result => {
      if (result) {
        result.dateString = new Date(result.committedOn * 1000).toLocaleDateString()
        this.buildConfig = result
      }
    })
    this.messageService.sendMessage(getMessageBody(BlockchainMessageType.getinfo)).subscribe(r => {
      if (r.result) {
        this.info = r.result
      }
    })
    this.refreshBalances()
    this.messageService.sendMessage(getMessageBody(WalletMessageType.getdlcwalletaccounting)).subscribe(r => {
      if (r.result) {
        this.dlcWalletAccounting = r.result
      }
    })
    this.messageService.sendMessage(getMessageBody(WalletMessageType.estimatefee)).subscribe(r => {
      if (r.result) { // like '1234 sats/vbyte'
        // Rip string to number
        const matches = MATCH_LEADING_DIGITS.exec(r.result)
        if (matches && matches[0]) {
          this.feeEstimate = parseInt(matches[0])
        } else {
          console.error('failed to process fee estimate string')
        }
      }
    })
    this.messageService.sendMessage(getMessageBody(DLCMessageType.getdlchostaddress)).subscribe(r => {
      if (r.result) {
        this.torDLCHostAddress = r.result
        console.warn('torDLCHostAddress:', this.torDLCHostAddress)
      }
    })
    this.refreshDLCStates()
  }

  refreshBalances() {
    console.debug('refreshBalances()')

    this.messageService.sendMessage(getMessageBody(WalletMessageType.getbalances, [true])).subscribe(r => {
      if (r.result) {
        this.balances = r.result
      }
    })
  }

  refreshDLCState(dlc: DLCContract) {
    console.debug('refreshDLCState()', dlc)
    return this.messageService.sendMessage(getMessageBody(WalletMessageType.getdlc, [dlc.dlcId])).pipe(tap(r => {
      console.debug('getdlc', r)

      if (r.result) {
        const dlc = <DLCContract>r.result
        // Inject in dlcs
        const i = this.dlcs.value.findIndex(d => d.dlcId === dlc.dlcId)
        // console.debug('i:', i)
        if (i !== -1) {
          const removed = this.dlcs.value.splice(i, 1, dlc)
          // console.debug('removed:', removed)
          this.dlcs.next(this.dlcs.value)
        } else {
          console.warn('refreshDLCState()', 'did not find dlcId', dlc.dlcId, 'in existing dlcs')
          // The DLC didn't exist yet, this shouldn't happen...
          this.dlcs.value.push(dlc)
          this.dlcs.next(this.dlcs.value)
        }
        return dlc
      }
      return null
    }))
  }

  refreshDLCStates() {
    console.debug('refreshDLCStates()')
    this.messageService.sendMessage(getMessageBody(WalletMessageType.getdlcs)).subscribe(r => {
      if (r.result) {
        this.dlcs.next(r.result)
        // Decode all ContractInfos
        for (const dlc of <DLCContract[]>r.result) {
          this.messageService.sendMessage(getMessageBody(CoreMessageType.decodecontractinfo, [dlc.contractInfo])).subscribe((r: ServerResponse<ContractInfo>) => {
            console.warn('decodecontractinfo', r)
            if (r.result) {
              const ci = this.contractInfos.value
              ci[dlc.dlcId] = r.result
            }
          })
        }
      }
    })
  }


}
