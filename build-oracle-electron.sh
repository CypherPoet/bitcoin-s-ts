#!/bin/bash

# downloads the bitcoin-s-server.zip file corresponding to your operating system 
# then sets up Suredbits Wallets dependencies
OS="`uname`"
case $OS in
  'Linux')
   OS='Linux'
    ;;
  'WindowsNT')
    OS='Windows'
    ;;
  'Darwin') 
    OS='Mac'
    ;;
  'incompatible') ;;
  *) ;;
esac

cd oracle-electron-ts

Chip="`uname -m`"

if [[ $Chip == 'arm64' ]]; then 
	echo "you're on a M1 Mac need to generate bitcoin-s-oracle-server.zip if have not already done so"
elif [[ $OS == 'Mac' ]]; then 
	curl -O -L https://github.com/bitcoin-s/bitcoin-s/releases/download/1.9.3/bitcoin-s-oracle-server-macosx-1.9.3.zip
elif [[ $OS == 'Windows' ]]; then
	curl -O -L https://github.com/bitcoin-s/bitcoin-s/releases/download/1.9.3/bitcoin-s-oracle-server-windowsserver2022-1.9.3.zip
elif [[ $OS == 'Linux' ]]; then
	curl -O -L https://github.com/bitcoin-s/bitcoin-s/releases/download/1.9.3/bitcoin-s-oracle-server-linux-1.9.3.zip

else 
	echo "not supported OS"
fi

for name in *bitcoin-s-oracle-server*; do
	if [ -e "$name" ]; then 
		rm -rf node_modules
		cd ..
		npm run clean
		npm i && npm run build
		cd oracle-electron-ts 
		npm i && npm run build && npm run make
		echo "Want to start the server in dev mode? Run cd oracle-electron-ts && npm run start"
	else 
		cd ..
		echo "
		Retrieve bitcoin-s-server file from https://github.com/bitcoin-s/bitcoin-s releases/tag/1.9.2 need to put the bitcoin-s-oracle-server.zip file in ~/bitcoin-s-ts/oracle-electron-ts. 
		For Mac m1 if file not on the github then need to generate it like so
		go to your bitcoin-s node and inside it Run sbt app/oracle-server/universal:packageBin
		then Run cd app/oracle-server/target/universal 
		then Run cp <the zip file> ~/bitcoin-s-ts/oracle-electron-ts"

	fi
done
