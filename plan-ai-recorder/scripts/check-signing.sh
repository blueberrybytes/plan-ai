#!/bin/bash

# Plan AI Mac App Store Build Readiness Checker

echo "🔍 Checking Mac App Store Build Readiness..."
echo "------------------------------------------"

# 1. Check for Apple Intermediate Certificate (WWDR G3)
echo -n "Checking Apple Intermediate CA... "
if security find-certificate -c "Apple Worldwide Developer Relations Certification Authority" > /dev/null 2>&1; then
    echo "✅ Found"
else
    echo "❌ MISSING"
    echo "   👉 Action: Download and open this: https://www.apple.com/certificateauthority/AppleWWDRG3.cer"
fi

# 2. Check for Application Certificate
echo -n "Checking Mac App Distribution Cert... "
APP_CERT=$(security find-identity -v -p codesigning | grep "3rd Party Mac Developer Application")
if [ -n "$APP_CERT" ]; then
    echo "✅ Found"
else
    echo "❌ MISSING"
    echo "   👉 Action: Download 'Mac App Distribution' .cer from Apple Portal and double-click it."
fi

# 3. Check for Installer Certificate
echo -n "Checking Mac Installer Distribution Cert... "
INST_CERT=$(security find-identity -v -p codesigning | grep "3rd Party Mac Developer Installer")
if [ -n "$INST_CERT" ]; then
    echo "✅ Found"
else
    echo "❌ MISSING"
    echo "   👉 Note: The certificate is installed, but your Mac doesn't see the matching private key."
    echo "   👉 Action: Open 'Keychain Access', find the '3rd Party Mac Developer Application' private key, and drag 'mac_installer.cer' right onto it."
fi

# 4. Check for Provisioning Profile
echo -n "Checking Provisioning Profile... "
if [ -f "build/mas.provisionprofile" ]; then
    echo "✅ Found"
else
    echo "❌ MISSING"
    echo "   👉 Action: Download 'Plan AI Recorder MAS' profile from Apple Portal, rename to 'mas.provisionprofile', and put in build/ folder."
fi

echo "------------------------------------------"
if [[ -n "$APP_CERT" && -n "$INST_CERT" && -f "build/mas.provisionprofile" ]]; then
    echo "🎉 EVERYTHING IS READY! Run 'yarn package' to build."
else
    echo "⏳ Please complete the missing steps above."
    echo "   If the Installer is still 'MISSING', try this one-liner to force it:"
    echo "   sudo security import mac_installer.cer -k /Library/Keychains/System.keychain"
fi
