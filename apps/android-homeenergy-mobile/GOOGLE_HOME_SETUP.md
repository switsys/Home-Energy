# Optional native Google Home SDK — v0.7 (development)

**v0.6 is the verified Samsung fallback. Do not remove or modify it.**
The v0.7 googleHome flavor is an experimental build of the **same app package**,
not a Companion, re-pairing flow or new app ID.

The standard flavor has no embedded Google Home controls. The googleHome flavor
uses the private Google Home Android SDK for consented device discovery, and
explicit per-device on/off commands only. No scheduled actions, hidden device
writes or changes to existing Google Home automations.

## Google Cloud configuration required before live device testing

1. In Google Cloud Console, configure an OAuth consent screen in Testing mode
   and add the Google Account used by the phone as a test user.
2. Create an OAuth client of type Android with exact package name:
   se.lierikes.homeenergy.mobile.
3. Sign the experimental APK with the **same persistent key as v0.6** and
   register its SHA-1 fingerprint for that Android OAuth client:
   95:CE:A5:04:C4:F6:27:72:57:11:95:5A:25:A5:02:E1:25:09:B8:00.
   The fingerprint is public information; the private signing key is not.
4. Run the googleHome flavor. Grant Google access to the correct structure.
5. Discover and verify the actual eHomeLife/Meross outlet type and whether
   OnOff commands are available. Nothing is controlled during discovery.
6. Explicitly confirm each power action in the app; the SDK rechecks granted
   structure and device commands and reads the device state afterward.

**Never commit any keystore, token, private Google SDK AAR, OAuth client secret
or user device identifiers.** A debug-signed APK with a different certificate
cannot upgrade the installed v0.6 build and needs its own Android OAuth client.

## Status

- v0.6 installed on Samsung, opens Google Home; preserved.
- v0.7 standard CI tests must pass before marking ready.
- v0.7 private Google Home SDK Kotlin build and real-device OAuth require
  further verification. No Samsung compatibility claim yet.

Official references:
https://developers.home.google.com/apis/android/oauth
https://developers.home.google.com/apis/android/permissions
https://developers.home.google.com/apis/android/device/control
