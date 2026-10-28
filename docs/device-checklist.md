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
- [ ] Photograph Hotshoe's camera clock with your camera, enter both times, and export the trip's GPX matched to the camera clock: in digiKam, with the same time zone set, photos land where they were taken.
- [ ] With Decimal mark set to Comma, copy a latitude on its own and paste it into digiKam's coordinate field.
- [ ] In Entries, **Select** two entries and export them: only those two are in the file.
- [ ] In Entries, open an Entry and set its **Date and time** with the wheel: it moves to its new Day and shows the time you set.
- [ ] Make a backup with photos and save it to iCloud Drive.
- [ ] Make a backup without photos after adding a photo: the More tab still says the photo isn't backed up, and a backup with photos clears it.
- [ ] Restore that backup into a fresh install (delete and re-add the app): entries, trips, and photos all return.

## Map

- [ ] The Map tab asks before loading; tap **Load map**: points and clusters show, and the map follows dark mode.
- [ ] With the map open, change **Appearance** in Settings: the map switches to match.
- [ ] Tap a point: its card shows the thumbnail and copies coordinates.
- [ ] View an area, then turn on flight mode and reopen the map: that area still shows.
- [ ] In Entries, tap a Day's date to open its map: one finger over the map scrolls the page, and two fingers move the map.
- [ ] Open several Days one after another: each opens promptly, and the app stays responsive.
- [ ] Tap **Trail** on the Map tab and on a Day map, in light and dark mode: the amber line and its dark edge stand out from the map and the pins, and it draws itself smoothly from the first pin to the last in about two seconds. If the draw-in stutters, switch to growing the line in a few steps over the same two seconds.
- [ ] With Reduce Motion on, tap **Trail**: the whole line appears at once.

## Storage and accessibility

- [ ] Settings, **Appearance**: Light and Dark stay that way when the iPhone switches mode, System follows it, and the status bar matches. Force-quit and reopen: the choice is kept, with no flash of the other mode.
- [ ] More, Storage: it says iOS has agreed to keep the data (after the first log).
- [ ] Set the largest text size (Settings, Accessibility, Display & Text Size, Larger Text): every screen still fits without sideways scrolling.
- [ ] With VoiceOver on, log a location: the stages are announced, and every button has a name.
- [ ] With Reduce Motion on, the dial and map don't animate.
