#!/bin/bash
if ! command -v pkg &> /dev/null
then
    echo "Installing pkg"
    npm i -g pkg
fi


rm -Rf build
mkdir build
cd build

git clone git@github.com:kjdElectronics/fd-tone-notify.git code
cd code
npm install --production

UNAME=$(uname -m)
if [[ $UNAME == *"arm"* ]]; then
  pkg package.json --targets node12.18.1 --out-path build
  cd build
else
  pkg package.json --targets node12-win-x64,node12-linux-x64 --out-path build
  cd build
  mv fd-tone-notify-win.exe fd-tone-notify.exe
  mv fd-tone-notify-linux fd-tone-notify
fi

#cd back to root build folder
cd ../../
# Move the built executables back to root build
mv code/build/* .
# Remove code
rm -Rf code

