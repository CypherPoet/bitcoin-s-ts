import { AfterViewInit, Component, EventEmitter, Input, OnInit, Output } from '@angular/core'
import { FormBuilder, FormGroup, Validators } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatSnackBar } from '@angular/material/snack-bar'
import { TranslateService } from '@ngx-translate/core'
import * as FileSaver from 'file-saver'

import { ConfirmationDialogComponent } from '~app/dialog/confirmation/confirmation.component'
import { ErrorDialogComponent } from '~app/dialog/error/error.component'

import { AlertType } from '~component/alert/alert.component'
import { MessageService } from '~service/message.service'
import { WalletStateService } from '~service/wallet-state-service'
import { Attestment, ContractInfo, CoreMessageType, DLCContract, DLCMessageType, DLCState, EnumContractDescriptor, NumericContractDescriptor, WalletMessageType } from '~type/wallet-server-types'
import { AcceptWithHex, SignWithHex } from '~type/wallet-ui-types'
import { copyToClipboard, formatDateTime, formatISODate, formatNumber, formatPercent, isCancelable, isExecutable, isFundingTxRebroadcastable, isRefundable, mempoolTransactionURL, validateHexString } from '~util/utils'
import { getMessageBody } from '~util/wallet-server-util'


@Component({
  selector: 'app-contract-detail',
  templateUrl: './contract-detail.component.html',
  styleUrls: ['./contract-detail.component.scss']
})
export class ContractDetailComponent implements OnInit {

  public Object = Object
  public AlertType = AlertType
  public DLCState = DLCState
  public copyToClipboard = copyToClipboard
  public formatNumber = formatNumber
  public formatPercent = formatPercent
  public isCancelable = isCancelable
  public isRefundable = isRefundable
  public isExecutable = isExecutable
  public isFundingTxRebroadcastable = isFundingTxRebroadcastable

  _dlc!: DLCContract
  get dlc(): DLCContract { return this._dlc }
  @Input() set dlc(e: DLCContract) { this._dlc = e; this.reset() }

  _contractInfo!: ContractInfo
  get contractInfo(): ContractInfo { return this._contractInfo }
  @Input() set contractInfo(e: ContractInfo) { this._contractInfo = e }

  // Optional
  _accept: AcceptWithHex|null = null
  get accept(): AcceptWithHex|null { return this._accept }
  @Input() set accept(a: AcceptWithHex|null) { this._accept = a }

  // Optional
  _sign: SignWithHex|null = null
  get sign(): SignWithHex|null { return this._sign }
  @Input() set sign(s: SignWithHex|null) { this._sign = s }

  getEnumContractDescriptor() {
    return <EnumContractDescriptor>this.contractInfo.contractDescriptor
  }

  getContractDescriptor() {
    if (this.isEnum())
      return <EnumContractDescriptor>this.contractInfo.contractDescriptor
    else // if (this.isNumeric())
      return <NumericContractDescriptor>this.contractInfo.contractDescriptor
  }

  @Output() close: EventEmitter<void> = new EventEmitter()

  // showDeleteSuccess = false

  oracleAttestations: string // OracleAttestmentTLV
  contractMaturity: string
  contractTimeout: string

  private reset() {
    if (this.dlc) {
      this.contractMaturity = formatDateTime(this.dlc.contractMaturity)
      this.contractTimeout = formatDateTime(this.dlc.contractTimeout)
      this.oracleAttestations = this.dlc.oracleSigs?.toString() || ''
    } else {
      this.oracleAttestations = ''
      this.contractTimeout = ''
    }
  }

  // For Completing DLC Contracts

  form: FormGroup
  get f() { return this.form.controls }

  private defaultFilename: string

  executing = false
  acceptSigned = false
  signBroadcast = false

  constructor(private translate: TranslateService, private snackBar: MatSnackBar,
    private messsageService: MessageService, private walletStateService: WalletStateService, 
    private dialog: MatDialog, private formBuilder: FormBuilder, private messageService: MessageService) { }

  ngOnInit(): void {
    this.defaultFilename = this.translate.instant('contractDetail.defaultSignFilename')
    this.form = this.formBuilder.group({
      filename: [this.defaultFilename, Validators.required],
    })
  }

  onClose() {
    this.close.next()
  }

  isEnum() {
    const cd = <EnumContractDescriptor><unknown>this.contractInfo.contractDescriptor
    return cd.outcomes !== undefined
  }

  isNumeric() {
    const cd = <NumericContractDescriptor><unknown>this.contractInfo.contractDescriptor
    return cd.numDigits !== undefined
  }

  showTransactionIds() {
    return !([DLCState.offered].includes(this.dlc.state))
  }

  onCancelContract() {
    console.debug('onCancelContract()', this.dlc.dlcId)

    // TODO : Confirmation dialog?

    this.messsageService.sendMessage(getMessageBody(WalletMessageType.canceldlc, [this.dlc.dlcId])).subscribe(r => {
      // console.debug(' onCancelContract()', r)
      if (r.result) { // "Success"
        // this.showDeleteSuccess = true
        const config: any = { verticalPosition: 'top', duration: 3000 }
        this.snackBar.open(this.translate.instant('contractDetail.cancelContractSuccess'),
          this.translate.instant('action.dismiss'), config)

        // Force update DLC list
        this.walletStateService.refreshDLCStates()
        this.close.next()
      }
    })
  }

  onOracleAttestations() {
    console.debug('onOracleAttestations()', this.oracleAttestations)
    if (this.oracleAttestations) {
      // Keep extra whitespace out of the system
      const attestations = this.oracleAttestations.trim()

      // Validate oracleSignature as hex
      const isValidHex = validateHexString(attestations)
      if (!isValidHex) {
        console.error('oracleAttestations is not valid hex')
        const dialog = this.dialog.open(ErrorDialogComponent, {
          data: {
            title: 'dialog.error',
            content: 'The oracleAttestations entered are not valid hex',
          }
        })
        return
      }

      console.debug('oracleAttestations:', attestations)

      this.messsageService.sendMessage(getMessageBody(CoreMessageType.decodeattestments, [attestations])).subscribe(r => {
        console.debug('decodeattestments', r)

        if (r.result) {
          const attestment: Attestment = r.result
          console.debug('attestment:', attestment)

          const sigs = [attestations] // attestment.signatures
          const contractId = this.dlc.contractId
          const noBroadcast = false // Could allow changing

          // console.warn('attestations:', attestations, 'attestment.signatures:', attestment.signatures)

          this.messsageService.sendMessage(getMessageBody(WalletMessageType.executedlc, 
            [contractId, sigs, noBroadcast])).subscribe(r => {
            console.debug('executedlc', r)
    
            if (r.result) { // closingTxId?
              // This contract will change state and having closingTxId now, needs reloaded
    
              // Force update DLC list
              // this.walletStateService.refreshDLCStates()
    
              // Update just this item?
              this.refreshDLCState()
            }
          })
        }
      })
    } // eo if (this.oracleSignature)
  }

  // Refresh the state of the visible DLC in the wallet and refresh object bound in this view
  private refreshDLCState() {
    this.walletStateService.refreshDLCState(this.dlc).subscribe(r => {
      console.debug('dlc:', r)
      if (r.result) {
        this.dlc = <DLCContract>r.result
      }
    })
  }

  onReloadContract() {
    console.debug('onReloadContract()')

    this.refreshDLCState()
  }

  onRefund() {
    console.debug('onRefund()')

    const contractId = this.dlc.contractId
    const noBroadcast = false

    this.messsageService.sendMessage(getMessageBody(WalletMessageType.executedlcrefund, [contractId, noBroadcast])).subscribe(r => {
      // console.debug('executedlcrefund', r)

      if (r.result) {
        const txId = r.result
        this.refreshDLCState()
        const dialog = this.dialog.open(ConfirmationDialogComponent, {
          data: {
            title: 'dialog.cancelContractSuccess.title',
            content: 'dialog.cancelContractSuccess.content',
            params: { contractId, txId },
            linksContent: 'dialog.cancelContractSuccess.linksContent',
            links: [mempoolTransactionURL(txId, this.walletStateService.getNetwork())],
            action: 'action.close',
            showCancelButton: false,
          }
        })
      }
    })
  }

  onRebroadcastFundingTransaction() {
    console.debug('onRebroadcastFundingTransaction()')

    const contractId = this.dlc.contractId
    const txId = <string>this.dlc.fundingTxId

    this.messsageService.sendMessage(getMessageBody(WalletMessageType.broadcastdlcfundingtx, [contractId])).subscribe(r => {
      // console.debug('broadcastdlcfundingtx', r)

      if (r.result) {
        // const config: any = { verticalPosition: 'top', duration: 3000 }
        // this.snackBar.open(this.translate.instant('contractDetail.fundingRebroadcastSuccess'),
        //   this.translate.instant('action.dismiss'), config)

        const dialog = this.dialog.open(ConfirmationDialogComponent, {
          data: {
            title: 'dialog.rebroadcastSuccess.title',
            content: 'dialog.rebroadcastSuccess.content',
            params: { txId },
            linksContent: "dialog.rebroadcastSuccess.linksContent",
            links: [mempoolTransactionURL(txId, this.walletStateService.getNetwork())],
            action: 'action.close',
            showCancelButton: false,
          }
        })

        // Let polling take care of changing future state?
      }
    })
  }

  onRebroadcastClosingTransaction() {
    console.debug('onRebroadcastClosingTransaction()')

    const txId = this.dlc.closingTxId

    if (txId) {
      this.messsageService.sendMessage(getMessageBody(WalletMessageType.gettransaction, [txId])).subscribe(r => {
        // console.debug('gettransaction', r)

        if (r.result) {
          const rawTransactionHex = r.result

          this.messsageService.sendMessage(getMessageBody(WalletMessageType.sendrawtransaction, [rawTransactionHex])).subscribe(r => {
            // console.debug('sendrawtransaction', r)

            if (r.result) {
              // const config: any = { verticalPosition: 'top', duration: 3000 }
              // this.snackBar.open(this.translate.instant('contractDetail.closingRebroadcastSuccess'),
              //   this.translate.instant('action.dismiss'), config)

              const dialog = this.dialog.open(ConfirmationDialogComponent, {
                data: {
                  title: 'dialog.rebroadcastSuccess.title',
                  content: 'dialog.rebroadcastSuccess.content',
                  params: { txId },
                  linksContent: "dialog.rebroadcastSuccess.linksContent",
                  links: [mempoolTransactionURL(txId, this.walletStateService.getNetwork())],
                  action: 'action.close',
                  showCancelButton: false,
                }
              })
            }
          })
        }
      })
    }
  }

  onViewOnOracleExplorer() {
    console.debug('onViewOnOracleExplorer()')

    // DLCTableViewScala:161
    // val dlc = selectionModel.value.getSelectedItem
    // val primaryOracle =
    //   dlc.oracleInfo.singleOracleInfos.head.announcement
    // val url =
    //   GUIUtil.getAnnouncementUrl(GlobalData.network, primaryOracle)
    // GUIUtil.openUrl(url)
    
    //   def getAnnouncementUrl(
    //     network: BitcoinNetwork,
    //     primaryOracle: OracleAnnouncementTLV): String = {
    //   val baseUrl =
    //     ExplorerEnv.fromBitcoinNetwork(network).siteUrl
    //   s"${baseUrl}announcement/${primaryOracle.sha256.hex}"
    // }

    // dlc.oracleInfo.singleOracleInfos[0] does not exist, sha256.hex does not exist on what is there
  }

  getOutcomeValue(outcomeValue: number) {
    if (this.dlc.isInitiator) {
      return outcomeValue
    } else {
      return this.dlc.totalCollateral - outcomeValue
    }
  }

  // Sign Accepted

  onSign() {
    console.debug('onSign()')

    if (this.accept) {
      const v = this.form.value
      const acceptedDLC = this.accept.hex
      const filename = v.filename

      this.executing = true
      this.messageService.sendMessage(getMessageBody(WalletMessageType.signdlc, [acceptedDLC])).subscribe(r => {
        console.debug('signdlc', r)

        if (r.result) {
          // Save to file
          const blob = new Blob([r.result], {type: "text/plain;charset=utf-8"});
          FileSaver.saveAs(blob, filename)

          this.executing = false
          this.acceptSigned = true

          this.refreshDLCState()
        }
      })
    }
  }

  // Countersign Signed and broadcast

  onBroadcast() {
    console.debug('onBroadcast()')

    if (this.sign) {
      const signedDLC = this.sign.hex

      this.executing = true
      this.messageService.sendMessage(getMessageBody(WalletMessageType.adddlcsigsandbroadcast, [signedDLC])).subscribe(r => {
        console.debug('adddlcsigsandbroadcast', r)

        if (r.result) {
          const txId = r.result
          const dialog = this.dialog.open(ConfirmationDialogComponent, {
            data: {
              title: 'dialog.broadcastSuccess.title',
              content: 'dialog.broadcastSuccess.content',
              params: { txId },
              linksContent: "dialog.broadcastSuccess.linksContent",
              links: [mempoolTransactionURL(txId, this.walletStateService.getNetwork())],
              action: 'action.close',
              showCancelButton: false,
            }
          })

          this.executing = false
          this.signBroadcast = true

          this.refreshDLCState()
        }
      })
    }
  }
}
