# Tapis de court

The hall seen from above. Each court is drawn to scale, and the screen's grid never moves: only values change in their cells.

## Colour
- Hall floor: #0A1F44 (club navy), page edge #071631
- Court mat: #006FD6, a darker club blue so white text reaches 5:1 (club #0080F4 only reaches about 3.9:1)
- Free court: #0F3468
- Tape and primary text: #FFFFFF; soft text #CFE5FF on navy only
- Club gold: #FFD23F, reserved for CSJBAD57: nameplates, court lines and numbers, victory screen

## Type
- Big Shoulders Stencil 800: court numbers only. Its 4 breaks apart, so never use it for scores.
- Barlow Condensed 500 to 700: everything else, scores in tabular figures.

## Layout
All sizes derive from `--u`, 1% of a 1920 by 1080 stage. Five upright courts side by side, as in the Augny hall, with the assembly band along the bottom. Court lines use real 13.4 by 6.1 m geometry.

## Scores
Most matches have no live score. The net band then shows elapsed time at full size. Scores appear only when the feed provides them, with the time reduced beside them.

## Connection
The hall runs on a phone hotspot, so link state comes from the age of the last data, not the device's network flag: over 15 s is `Réseau instable`, over 45 s is a red banner over the top strip. Data freezes rather than guessing.

## Christmas
Automatic from 1 December to 6 January, or forced with `#noel` and `#classique`. Courts turn pine #0F5C43 with snow caps, garland and light snowfall. Gold stays reserved for the club.

## Totem
The club's stag is authored vector art (`assets/cerf.svg`), a front-on head with antlers, drawn in one colour. It appears in the top strip, on free courts and on the victory screen.

## Names
Full family and first names everywhere. A long name shrinks by at most 12%, then slides to its end and back, with pauses. Under reduced motion it shrinks further and ends with an ellipsis.

## Start screen
Entered once on the TV: tournament number or Badnet link, number of courts, theme. Settings stay in the address and on the device. Moving the mouse or pressing Échap reopens them.

## Motion
A received winner floods their half of the court. A club win also runs the full-screen victory: shuttle flight, gold flood, feather burst, about 7 seconds. No winner received means no celebration.
On a point, the score flips in its cell and a shuttle arc crosses the court. New assembly calls wipe in. Everything is disabled under reduced motion.
