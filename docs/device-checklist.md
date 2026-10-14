# On-device checklist

Automated tests run in WebKit, which is close to iOS Safari but not the same. Run through this on an iPhone after a release that touches location, storage, photos, files, or the map.

## Install and update

- [ ] Open the site in Safari, add it to the Home Screen, and open it from there.
- [ ] Force-quit Hotshoe and open it again: entries are still there.
- [ ] After a new version is deployed, leave the app and come back: a note says Hotshoe was updated.

## Location

- [ ] Log with Precise Location on: the fix reaches the target and saves on its own.
- [ ] Log with Precise Location off (Settings, Privacy & Security, Location Services, Safari Websites): the entry is flagged as accurate only to a few kilometres.
- [ ] Deny location, log, and follow the on-screen steps to allow it again.
- [ ] Log in flight mode with Wi-Fi off: GPS still gives a fix.
- [ ] Tap **Use this fix** before the target: the entry is marked as a weak fix.

## Photos

- [ ] **Log with photo**: the camera opens, and the photo joins the new entry.
- [ ] Add a photo from the library, including a HEIC and a portrait photo: both show the right way up.
- [ ] Open a photo full screen, pinch to zoom, and share it to Photos.

## Copy, export, and backup

- [ ] Copy coordinates and paste into a photo site or map app.
- [ ] Export GPX through the share sheet to Files, then check it in digiKam, Lightroom, and darktable.
- [ ] Export CSV and open it in Numbers or Excel: names with macrons come through.
- [ ] In Entries, **Select** two entries and export them: only those two are in the file.
- [ ] Make a backup with photos and save it to iCloud Drive.
- [ ] Restore that backup into a fresh install (delete and re-add the app): entries, trips, and photos all return.

## Map

- [ ] The Map tab asks before loading; tap **Load map**: points and clusters show, and the map follows dark mode.
- [ ] Tap a point: its card shows the thumbnail and copies coordinates.
- [ ] View an area, then turn on flight mode and reopen the map: that area still shows.

## Storage and accessibility

- [ ] More, Storage: it says iOS has agreed to keep the data (after the first log).
- [ ] Set the largest text size (Settings, Accessibility, Display & Text Size, Larger Text): every screen still fits without sideways scrolling.
- [ ] With VoiceOver on, log a location: the stages are announced, and every button has a name.
- [ ] With Reduce Motion on, the dial and map don't animate.
