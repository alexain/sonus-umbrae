# Scale catalog

This catalog lists the scale definitions currently available for integration into Sonus Umbrae's pitch system. The source material is the set of Frap Tools USTA scale tables supplied with the project research notes.

A composition such as `[0, 2, 4, 7, 9]` is expressed as **zero-based EDO steps from the root**. In 12-EDO one step is 100 cents; in the other groups one step is `1200 / EDO` cents. The octave endpoint is implicit and is not repeated in the list.

The identifiers below are short DSL names: lowercase words joined with underscores. Non-12-EDO identifiers keep an `edo15_`, `edo19_`, `edo22_`, or `edo24_` prefix. Common terms are abbreviated where useful (`maj`, `min`, `chroma`), and long descriptive suffixes are omitted while identifiers remain unique.

> The catalog is stored in `src/language/scales.ts`. Use an identifier directly with `pitch scale`, for example `pitch scale C edo19_4 with range n1@3 n4@5`. Non-12-EDO scale ranges use one-based scale degrees in the form `n<degree>@<octave>`; 12-EDO scales may also use conventional note-name ranges such as `C3 C5`.

## 12-EDO

90 definitions · 100 cents per EDO step.

| Scale | Identifier | Composition |
|---|---|---|
| Chromatic | `chroma` | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]` |
| Major Pentatonic 1 | `maj_penta_1` | `[0, 2, 4, 7, 9]` |
| Minor Pentatonic 2 | `min_penta_2` | `[0, 2, 5, 7, 10]` |
| Minor Pentatonic 3 | `min_penta_3` | `[0, 3, 5, 8, 10]` |
| Major Pentatonic 2 | `maj_penta_2` | `[0, 2, 5, 7, 9]` |
| Minor Pentatonic 1 | `min_penta_1` | `[0, 3, 5, 7, 10]` |
| Dominant Pentatonic | `dom_penta` | `[0, 2, 4, 7, 10]` |
| Whole Tone | `whole` | `[0, 2, 4, 6, 8, 10]` |
| Augmented | `aug` | `[0, 3, 4, 7, 8, 11]` |
| Prometheus | `prometheus` | `[0, 2, 4, 6, 9, 10]` |
| Hexatonic Blues | `hexatonic_blues` | `[0, 3, 5, 6, 7, 10]` |
| Ionian | `ionian` | `[0, 2, 4, 5, 7, 9, 11]` |
| Dorian | `dorian` | `[0, 2, 3, 5, 7, 9, 10]` |
| Phrygian | `phrygian` | `[0, 1, 3, 5, 7, 8, 10]` |
| Lydian | `lydian` | `[0, 2, 4, 6, 7, 9, 11]` |
| Mixolydian | `mixolydian` | `[0, 2, 4, 5, 7, 9, 10]` |
| Aeolian | `aeolian` | `[0, 2, 3, 5, 7, 8, 10]` |
| Locrian | `locrian` | `[0, 1, 3, 5, 6, 8, 10]` |
| Harmonic Minor — Aeolian #7, m Harmonic Modes | `harm_min` | `[0, 2, 3, 5, 7, 8, 11]` |
| Locrian #6 | `locrian_6` | `[0, 1, 3, 5, 6, 9, 10]` |
| Ionian #5 | `ionian_5` | `[0, 2, 4, 5, 8, 9, 11]` |
| Dorian #4 | `dorian_4` | `[0, 2, 3, 6, 7, 9, 10]` |
| Phrygian Dominant | `phrygian_dom` | `[0, 1, 4, 5, 7, 8, 10]` |
| Lydian #2 | `lydian_2` | `[0, 3, 4, 6, 7, 9, 11]` |
| Ultralocrian | `ultralocrian` | `[0, 1, 3, 4, 6, 8, 9]` |
| Melodic Minor, Jazz Minor | `mel_min` | `[0, 2, 3, 5, 7, 9, 11]` |
| Dorian b9 | `dorian_b9` | `[0, 1, 3, 5, 7, 9, 10]` |
| Lydian Augmented | `lydian_aug` | `[0, 2, 4, 6, 8, 9, 11]` |
| Lydian Dominant | `lydian_dom` | `[0, 2, 4, 6, 7, 9, 10]` |
| Mixolydian b6 | `mixolydian_b6` | `[0, 2, 4, 5, 7, 8, 10]` |
| Semilocrian, Aeolian b5 | `semilocrian_aeolian_b5` | `[0, 2, 3, 5, 6, 8, 10]` |
| Superlocrian | `superlocrian` | `[0, 1, 3, 4, 6, 8, 10]` |
| Double Harmonic Major | `double_harm_maj` | `[0, 1, 4, 5, 7, 8, 11]` |
| Lydian #2 #6 | `lydian_2_6` | `[0, 3, 4, 6, 7, 10, 11]` |
| UltraPhrygian, Ultralocrian natural 5 | `ultraphrygian_ultralocrian_nat` | `[0, 1, 3, 4, 7, 8, 9]` |
| Double Harmonic Minor, Hungarian Minor | `double_harm_min` | `[0, 2, 3, 6, 7, 8, 11]` |
| Mixolydian b2 b5, Oriental | `mixolydian_b2_b5` | `[0, 1, 4, 5, 6, 9, 10]` |
| Ionian Augmented #2 | `ionian_aug_2` | `[0, 3, 4, 5, 8, 9, 11]` |
| Locrian bb3 bb7 | `locrian_bb3_bb7` | `[0, 1, 2, 5, 6, 8, 9]` |
| Hungarian Major | `hungarian_maj` | `[0, 3, 4, 6, 7, 9, 10]` |
| Superlocrian bb6 bb7 | `superlocrian_bb6_bb7` | `[0, 1, 3, 4, 6, 7, 9]` |
| Harmonic Minor b5 | `harm_min_b5` | `[0, 2, 3, 5, 6, 8, 11]` |
| Superlocrian #6 | `superlocrian_6` | `[0, 1, 3, 4, 6, 9, 10]` |
| Melodic Minor #5, Jazz Minor #5 | `mel_min_5` | `[0, 2, 3, 5, 8, 9, 11]` |
| Dorian b9 #11 | `dorian_b9_11` | `[0, 1, 3, 6, 7, 9, 10]` |
| Lydian Augmented #3 | `lydian_aug_3` | `[0, 2, 5, 6, 8, 9, 11]` |
| Harmonic Major, Ionian b6 | `harm_maj` | `[0, 2, 4, 5, 7, 8, 11]` |
| Dorian b5 | `dorian_b5` | `[0, 2, 3, 5, 6, 9, 10]` |
| Phrygian b4 | `phrygian_b4` | `[0, 1, 3, 4, 7, 8, 10]` |
| Lydian b3 | `lydian_b3` | `[0, 2, 3, 6, 7, 9, 11]` |
| Mixolydian b9 | `mixolydian_b9` | `[0, 1, 4, 5, 7, 9, 10]` |
| Lydian Augmented #2 | `lydian_aug_2` | `[0, 3, 4, 6, 8, 9, 11]` |
| Locrian bb7 | `locrian_bb7` | `[0, 1, 3, 5, 6, 8, 9]` |
| Neapolitan Major | `neapolitan_maj` | `[0, 1, 3, 5, 7, 9, 11]` |
| Leading Whole-Tone | `leading_whole` | `[0, 2, 4, 6, 8, 10, 11]` |
| Lydian Augmented Dominant | `lydian_aug_dom` | `[0, 2, 4, 6, 8, 9, 10]` |
| Lydian Dominant b6 | `lydian_dom_b6` | `[0, 2, 4, 6, 7, 8, 10]` |
| Major Locrian | `maj_locrian` | `[0, 2, 4, 5, 6, 8, 10]` |
| Semilocrian b4 | `semilocrian_b4` | `[0, 2, 3, 4, 6, 8, 10]` |
| Superlocrian bb3 | `superlocrian_bb3` | `[0, 1, 2, 4, 6, 8, 10]` |
| Neapolitan Minor | `neapolitan_min` | `[0, 1, 3, 5, 7, 8, 11]` |
| Lydian #6 | `lydian_6` | `[0, 2, 4, 6, 7, 10, 11]` |
| Mixolydian Augmented | `mixolydian_aug` | `[0, 2, 4, 5, 8, 9, 10]` |
| Aeolian #4, Hungarian Gipsy | `aeolian_4` | `[0, 2, 3, 6, 7, 8, 10]` |
| Locrian Dominant | `locrian_dom` | `[0, 1, 4, 5, 6, 8, 10]` |
| Ionian #2 | `ionian_2` | `[0, 3, 4, 5, 7, 9, 11]` |
| Ultralocrian bb3 | `ultralocrian_bb3` | `[0, 1, 2, 4, 6, 8, 9]` |
| Chromatic Hypolydian | `chroma_hypolydian` | `[0, 1, 4, 6, 7, 8, 11]` |
| Chromatic Hypophrygian | `chroma_hypophrygian` | `[0, 3, 5, 6, 7, 10, 11]` |
| Chromatic Hypodorian | `chroma_hypodorian` | `[0, 2, 3, 4, 7, 8, 9]` |
| Chromatic Mixolydian | `chroma_mixolydian` | `[0, 1, 2, 5, 6, 7, 10]` |
| Chromatic Lydian | `chroma_lydian` | `[0, 1, 4, 5, 6, 9, 11]` |
| Chromatic Phrygian | `chroma_phrygian` | `[0, 3, 4, 5, 8, 10, 11]` |
| Chromatic Dorian | `chroma_dorian` | `[0, 1, 2, 5, 7, 8, 9]` |
| Chromatic Hypophrygian inverse | `chroma_hypophrygian_inverse` | `[0, 1, 2, 5, 6, 7, 9]` |
| Chromatic Hypolydian inverse | `chroma_hypolydian_inverse` | `[0, 1, 4, 5, 6, 8, 11]` |
| Chromatic Dorian inverse | `chroma_dorian_inverse` | `[0, 3, 4, 5, 7, 10, 11]` |
| Chromatic Phrygian inverse | `chroma_phrygian_inverse` | `[0, 1, 2, 4, 7, 8, 9]` |
| Chromatic Lydian inverse | `chroma_lydian_inverse` | `[0, 1, 3, 6, 7, 8, 11]` |
| Chromatic Mixolydian inverse | `chroma_mixolydian_inverse` | `[0, 2, 5, 6, 7, 10, 11]` |
| Chromatic Hypodorian inverse | `chroma_hypodorian_inverse` | `[0, 3, 4, 5, 8, 9, 10]` |
| Bebop Major | `bebop_maj` | `[0, 2, 4, 5, 7, 8, 9, 11]` |
| Bebop Dominant | `bebop_dom` | `[0, 2, 4, 5, 7, 9, 10, 11]` |
| Bebop Dorian | `bebop_dorian` | `[0, 2, 3, 4, 5, 7, 9, 10]` |
| Bebop Dorian Alternative | `bebop_dorian_alt` | `[0, 2, 3, 5, 7, 9, 10, 11]` |
| Bebop Minor | `bebop_min` | `[0, 2, 3, 5, 7, 8, 9, 11]` |
| Bebop Locrian | `bebop_locrian` | `[0, 1, 3, 5, 6, 7, 8, 10]` |
| Bebop Harmonic Minor — Natural Minor | `bebop_harm_min` | `[0, 2, 3, 5, 7, 8, 10, 11]` |
| Diminished, Whole-Half | `dim_whole_half` | `[0, 2, 3, 5, 6, 8, 9, 11]` |
| Octatonic, Half-Whole | `octatonic_half_whole` | `[0, 1, 3, 4, 6, 7, 9, 10]` |

## 15-EDO

10 definitions · 80 cents per EDO step.

| Scale | Identifier | Composition |
|---|---|---|
| Chromatic | `edo15_chroma` | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]` |
| Blackwood | `edo15_blackwood_6` | `[0, 4, 5, 9, 10, 14]` |
| 15 Tone Miller Porcupine 7 | `edo15_miller_porcupine_7` | `[0, 2, 4, 6, 9, 11, 13]` |
| 15 Tone Miller Porcupine 7 Major | `edo15_miller_porcupine_maj` | `[0, 3, 5, 7, 9, 11, 13]` |
| Miller’s Kusiro | `edo15_miller_kusiro` | `[0, 1, 4, 6, 9, 10, 11, 13]` |
| 15 Tone Major, Jones’s Porcupine 8 | `edo15_maj_porcupine_8` | `[0, 2, 4, 5, 7, 9, 11, 13]` |
| Rempt’s Andal | `edo15_rempt_andal` | `[0, 2, 4, 5, 7, 9, 10, 12, 14]` |
| Blackwood | `edo15_blackwood_10` | `[0, 1, 3, 4, 6, 7, 9, 10, 12, 13]` |
| 15 Tone Major-Minor Mix | `edo15_maj_min_mix` | `[0, 3, 4, 5, 6, 9, 10, 11, 13, 14]` |
| 12 Tone Chromatic | `edo15_chroma_12` | `[0, 1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14]` |

## 19-EDO

24 definitions · 63.1579 cents per EDO step.

| Scale | Identifier | Composition |
|---|---|---|
| Chromatic | `edo19_chroma` | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]` |
| Four out of 19 | `edo19_4` | `[0, 5, 9, 14]` |
| Five out of 19 | `edo19_5` | `[0, 4, 8, 12, 16]` |
| Quasi-Equal Pentatonic | `edo19_quasi_equal_penta` | `[0, 4, 8, 11, 15]` |
| Yasser’s Hexad | `edo19_yasser_hexad` | `[0, 3, 6, 9, 12, 15]` |
| Oljare Diminished | `edo19_oljare_dim_1` | `[0, 4, 5, 9, 10, 14, 15]` |
| Oljare Diminished | `edo19_oljare_dim_2` | `[0, 5, 6, 11, 12, 13, 18]` |
| Oljare Octatonic | `edo19_oljare_octatonic` | `[0, 2, 4, 7, 9, 11, 14, 16]` |
| Oljare Pentaenharmonic | `edo19_oljare_pentaenharmonic` | `[0, 1, 4, 5, 8, 11, 12, 15, 16]` |
| Negri’s Ten Plus Nine | `edo19_negri_10_9` | `[0, 2, 4, 6, 8, 10, 12, 14, 16, 18]` |
| Keenan eleven out of 19 | `edo19_keenan_11` | `[0, 3, 4, 5, 8, 9, 12, 13, 14, 17, 18]` |
| Krantz eleven out of 19 | `edo19_krantz_11` | `[0, 2, 4, 6, 8, 10, 11, 13, 14, 16, 18]` |
| McLaren eleven out of 19 | `edo19_mclaren_11` | `[0, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16]` |
| Gould Eleven out of 19 | `edo19_gould_11` | `[0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18]` |
| Meantone Chromatic (1/3 comma) | `edo19_meantone_chroma` | `[0, 1, 3, 5, 6, 8, 9, 11, 12, 14, 16, 17]` |
| Genus Diatonico-Chromaticum | `edo19_genus_diatonico_chromaum` | `[0, 2, 3, 5, 6, 8, 9, 11, 13, 14, 16, 17]` |
| Yasser’s Supradiatonic | `edo19_yasser_supradiatonic` | `[0, 2, 3, 5, 6, 8, 10, 11, 13, 14, 16, 17]` |
| Mandelbaum’s Eight out of 19 | `edo19_mandelbaum_8` | `[0, 2, 5, 7, 9, 12, 14, 16]` |
| Mandelbaum’s Nine out of 19 | `edo19_mandelbaum_9` | `[0, 2, 4, 7, 9, 11, 13, 15, 17]` |
| Mandelbaum’s Ten out of 19 | `edo19_mandelbaum_10` | `[0, 2, 4, 5, 7, 9, 11, 13, 15, 17]` |
| Mandelbaum’s Eleven out of 19 | `edo19_mandelbaum_11` | `[0, 2, 3, 5, 7, 9, 10, 12, 14, 16, 17]` |
| Mandelbaum’s Twelve out of 19 | `edo19_mandelbaum_12` | `[0, 1, 3, 4, 6, 8, 9, 11, 12, 14, 15, 17]` |
| Mandelbaum’s Thirteen out of 19 | `edo19_mandelbaum_13` | `[0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18]` |
| Mandelbaum’s Fourteen out of 19 | `edo19_mandelbaum_14` | `[0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 18]` |

## 22-EDO

123 definitions · 54.5455 cents per EDO step.

| Scale | Identifier | Composition |
|---|---|---|
| Chromatic | `edo22_chroma` | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]` |
| Twelve-tone Chromatic (1/3-comma positive) | `edo22_12_chroma` | `[0, 3, 4, 5, 8, 9, 12, 13, 16, 17, 18, 21]` |
| 22 tone Major | `edo22_maj` | `[0, 4, 8, 9, 13, 17, 21]` |
| 22 tone Melodic Minor | `edo22_mel_min` | `[0, 4, 6, 9, 13, 16, 20]` |
| 22 tone Harmonic Minor | `edo22_harm_min` | `[0, 4, 6, 9, 13, 15, 20]` |
| 22 tone Harmonic Major | `edo22_harm_maj` | `[0, 4, 7, 9, 13, 15, 20]` |
| 22 tone Astrology-10 | `edo22_astrology_10` | `[0, 3, 4, 7, 10, 11, 14, 15, 18, 21]` |
| 22 tone Doublewide-10 | `edo22_doublewide_10` | `[0, 1, 5, 6, 10, 11, 12, 16, 17, 21]` |
| 22 tone Doublewide-14 | `edo22_doublewide_14` | `[0, 1, 2, 5, 6, 7, 10, 11, 12, 13, 16, 17, 18, 21]` |
| 22 tone Fleetwood-14 | `edo22_fleetwood_14` | `[0, 1, 2, 5, 6, 7, 8, 11, 12, 13, 16, 17, 18, 19]` |
| 22 tone Hedgehog-6 | `edo22_hedgehog_6` | `[0, 5, 8, 11, 16, 19]` |
| 22 tone Hedgehog-8 | `edo22_hedgehog_8` | `[0, 2, 5, 8, 11, 13, 16, 19]` |
| 22 tone Hedgehog-14 | `edo22_hedgehog_14` | `[0, 2, 3, 5, 7, 8, 10, 11, 13, 14, 16, 18, 19, 21]` |
| 22 tone Jubilee-12 | `edo22_jubilee_12` | `[0, 2, 4, 5, 7, 9, 11, 13, 15, 16, 18, 20]` |
| 22 tone Pajara-12 | `edo22_pajara_12` | `[0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 18, 20]` |
| 22 tone Supra-5, Septimal Minor Pentatonic | `edo22_supra_5` | `[0, 5, 9, 13, 18]` |
| 22 tone Supra-7 | `edo22_supra_7` | `[0, 4, 5, 9, 13, 17, 18]` |
| 22 tone Supra-12 | `edo22_supra_12` | `[0, 1, 4, 5, 8, 9, 10, 13, 14, 17, 18, 21]` |
| 22 tone Urchin-14 | `edo22_urchin_14` | `[0, 2, 4, 5, 7, 8, 10, 11, 13, 15, 16, 18, 19, 21]` |
| 22 tone Wilson Pi-Meantone | `edo22_wilson_pi_meantone` | `[0, 3, 4, 7, 8, 11, 12, 13, 16, 17, 20, 21]` |
| Ionian Porcupine | `edo22_ionian_porcupine` | `[0, 4, 7, 9, 13, 16, 19]` |
| Dorian Porcupine | `edo22_dorian_porcupine` | `[0, 4, 6, 9, 13, 16, 19]` |
| Aeolian Porcupine | `edo22_aeolian_porcupine` | `[0, 3, 6, 9, 13, 15, 18]` |
| Major Porcupine | `edo22_maj_porcupine` | `[0, 4, 7, 10, 13, 16, 20]` |
| Major-Minor Porcupine | `edo22_maj_min_porcupine` | `[0, 4, 7, 10, 13, 15, 19]` |
| Chameleon Porcupine | `edo22_chameleon_porcupine` | `[0, 4, 7, 10, 13, 17, 20]` |
| Symmetric Diminished Porcupine | `edo22_sym_dim_porcupine` | `[0, 3, 6, 10, 12, 16, 19]` |
| Porcupine-15 | `edo22_porcupine_15` | `[0, 2, 3, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21]` |
| Elevenplus | `edo22_elevenplus` | `[0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 18, 20]` |
| Hexachordal | `edo22_hexachordal` | `[0, 2, 4, 6, 8, 9, 11, 13, 15, 17, 19, 21]` |
| Noll Pseudo-diatonic | `edo22_noll_pseudo_dia` | `[0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21]` |
| Ballooning Rushes | `edo22_ballooning_rushes` | `[0, 3, 4, 10, 12, 18, 19]` |
| Crushed Oranges | `edo22_crushed_oranges` | `[0, 1, 4, 9, 10, 13, 18, 19]` |
| Kathartic Parts | `edo22_kathartic_parts` | `[0, 2, 3, 10, 12, 13, 20]` |
| Riveting Reds | `edo22_riveting_reds` | `[0, 1, 5, 6, 10, 12, 13, 17, 18]` |
| Rodentalia | `edo22_rodentalia` | `[0, 4, 5, 8, 9, 13, 14, 17, 18]` |
| Rezsutek’s Percussion Scale | `edo22_rezsutek_percussion` | `[0, 2, 5, 7, 10, 12, 15, 17, 20]` |
| 22 tone Magic-7 | `edo22_magic_7` | `[0, 6, 7, 13, 14, 15, 21]` |
| 22 tone Magic-10 | `edo22_magic_10` | `[0, 5, 6, 7, 8, 13, 14, 15, 20, 21]` |
| 22 tone Magic-13 | `edo22_magic_13` | `[0, 4, 5, 6, 7, 11, 12, 13, 14, 18, 19, 20, 21]` |
| 22 tone Orwell-5 | `edo22_orwell_5` | `[0, 5, 10, 15, 20]` |
| 22 tone Orwell-9 | `edo22_orwell_9` | `[0, 3, 5, 8, 10, 13, 15, 18, 20]` |
| 22 tone Orwell-13 | `edo22_orwell_13` | `[0, 1, 3, 5, 6, 8, 10, 11, 13, 15, 16, 18, 20]` |
| 22 tone SuperPythagorean | `edo22_superpythagorean` | `[0, 1, 4, 5, 6, 9, 10, 13, 14, 15, 18, 19]` |
| 22 tone Miller’s Porcupine-7 Major | `edo22_miller_porcupine_maj` | `[0, 3, 7, 10, 13, 16, 19]` |
| 22 tone Jones's Porcupine-8 | `edo22_jones_porcupine_8` | `[0, 3, 6, 7, 10, 13, 16, 19]` |
| Alternate Proper Decatonic | `edo22_alt_proper_decatonic` | `[0, 3, 4, 7, 9, 11, 13, 16, 18, 20]` |
| Exotic Symmetrical Decatonic | `edo22_exotic_sym_decatonic` | `[0, 2, 4, 7, 8, 11, 13, 15, 18, 19]` |
| Standard Pentachordal Major | `edo22_std_pentachordal_maj` | `[0, 2, 4, 7, 9, 11, 13, 16, 18, 20]` |
| Static Symmetrical Major | `edo22_static_sym_maj` | `[0, 2, 4, 7, 9, 11, 13, 15, 18, 20]` |
| Alternate Pentachordal Major | `edo22_alt_pentachordal_maj` | `[0, 2, 5, 7, 9, 11, 13, 15, 18, 20]` |
| Dynamic Symmetrical Major | `edo22_dyn_sym_maj` | `[0, 2, 5, 7, 9, 11, 13, 16, 18, 20]` |
| Static Symmetrical Minor | `edo22_static_sym_min` | `[0, 2, 4, 6, 9, 11, 13, 15, 17, 20]` |
| Alternate Pentachordal Minor | `edo22_alt_pentachordal_min` | `[0, 2, 4, 6, 8, 11, 13, 15, 17, 20]` |
| Dynamic Symmetrical Minor | `edo22_dyn_sym_min` | `[0, 2, 4, 6, 8, 11, 13, 15, 17, 19]` |
| Major quasi-equal Heptatonic | `edo22_maj_quasi_equal` | `[0, 4, 7, 10, 13, 16, 19]` |
| Minor quasi-equal Heptatonic, Miller's Porcupine-7 | `edo22_min_quasi_equal` | `[0, 3, 6, 9, 13, 16, 19]` |
| Harmonic Whole-Tone | `edo22_harm_whole` | `[0, 4, 7, 10, 14, 18]` |
| Nine-Limit Consonant Whole-Tone | `edo22_9_limit_consonant` | `[0, 4, 7, 11, 15, 18]` |
| 22 tone Blues | `edo22_blues` | `[0, 6, 9, 10, 13, 19]` |
| 22 tone mode of Tamil Matra | `edo22_tamil_matra` | `[0, 4, 8, 11, 13, 17, 20]` |
| Raga Kanakangi | `edo22_raga_kanakangi` | `[0, 2, 5, 9, 13, 15, 18]` |
| Raga Ramkali | `edo22_raga_ramkali` | `[0, 1, 7, 9, 10, 13, 14, 20]` |
| Raga Kharaharapriya, Bhimpalasi | `edo22_raga_kharaharapriya` | `[0, 4, 6, 9, 13, 17, 19]` |
| Twenty-two tone Natural Minor, Darbari Kanada, Gandhaara Grama (Damodara), Raga Darbari | `edo22_20_2_min` | `[0, 4, 6, 9, 13, 15, 19]` |
| Raga Vibhas (marva) | `edo22_raga_vibhas` | `[0, 1, 7, 13, 16]` |
| Raga Saveri | `edo22_raga_saveri` | `[0, 2, 9, 13, 14]` |
| Raga Deskar | `edo22_raga_deskar` | `[0, 3, 7, 13, 16]` |
| Raga Suddha Malhar | `edo22_raga_suddha_malhar` | `[0, 3, 9, 13, 16]` |
| Raga Bhupali | `edo22_raga_bhupali` | `[0, 4, 7, 13, 17]` |
| Raga Hamsadhvani | `edo22_raga_hamsadhvani` | `[0, 4, 7, 13, 20]` |
| Raga Durga | `edo22_raga_durga` | `[0, 4, 9, 13, 17]` |
| Raga Malkauns | `edo22_raga_malkauns` | `[0, 6, 9, 15, 18]` |
| Raga Gurjari Todi | `edo22_raga_gurjari_todi` | `[0, 1, 5, 11, 14, 21]` |
| Raga Bauli | `edo22_raga_bauli` | `[0, 2, 7, 13, 15, 20]` |
| Raga Kambhoji | `edo22_raga_kambhoji` | `[0, 4, 7, 9, 13, 16]` |
| Raga Takka | `edo22_raga_takka` | `[0, 6, 9, 13, 15, 20]` |
| Raga Tilang | `edo22_raga_tilang` | `[0, 7, 9, 13, 18, 20]` |
| Raga Bilashkhani Todi | `edo22_raga_bilashkhani_todi` | `[0, 1, 5, 9, 13, 14, 18]` |
| Raga Asavari | `edo22_raga_asavari` | `[0, 1, 5, 9, 13, 14, 19]` |
| Raga Rampurmat Pilu | `edo22_raga_rampurmat_pilu` | `[0, 1, 5, 9, 13, 14, 21]` |
| Raga Varali | `edo22_raga_varali` | `[0, 1, 5, 12, 13, 14, 20]` |
| Todi That | `edo22_todi_that` | `[0, 1, 5, 12, 13, 14, 21]` |
| Raga Lalita | `edo22_raga_lalita` | `[0, 1, 7, 9, 11, 14, 21]` |
| Bhairav That | `edo22_bhairav_that` | `[0, 1, 7, 9, 13, 14, 21]` |
| Gandhaara Grama (Somanatha) | `edo22_gandhaara_somanatha` | `[0, 2, 6, 9, 12, 15, 19]` |
| Murchhana Harinasva, Bhairavi That | `edo22_murchhana_harinasva` | `[0, 2, 6, 9, 13, 15, 19]` |
| Gandhaara Grama (Popley), Murchhana Matsarikrita | `edo22_gandhaara_popley` | `[0, 2, 6, 10, 13, 15, 19]` |
| Raga Multani | `edo22_raga_multani` | `[0, 2, 6, 12, 13, 14, 21]` |
| Raga Marva | `edo22_raga_marva` | `[0, 2, 7, 11, 13, 17, 20]` |
| Purvi That, Raga Shri | `edo22_purvi_that` | `[0, 2, 7, 12, 13, 15, 20]` |
| Raga Puriya Kalyan | `edo22_raga_puriya_kalyan` | `[0, 2, 7, 12, 13, 16, 20]` |
| Gandhaara Grama (Sarngadeva der. ma-grama) | `edo22_gandhaara_sarngadeva_ma` | `[0, 3, 5, 9, 12, 14, 18]` |
| Gandhaara Grama (Sarngadeva der. sa-grama) | `edo22_gandhaara_sarngadeva_sa` | `[0, 3, 5, 9, 12, 15, 18]` |
| Murchhana Hrishyaka | `edo22_murchhana_hrishyaka` | `[0, 3, 7, 9, 13, 16, 18]` |
| Raga Jogiya | `edo22_raga_jogiya` | `[0, 3, 7, 9, 13, 16, 20]` |
| 22 tone Minor, Superpyth-7, Raga Jaunpuri | `edo22_min_superpyth_7` | `[0, 4, 5, 9, 13, 14, 18]` |
| 22 tone "Just" Minor, Asavari That | `edo22_scale_7_that` | `[0, 4, 6, 9, 13, 15, 18]` |
| Gandhaara Grama (Narada der. ma-grama), Murchhana Pauravi | `edo22_gandhaara_narada_ma` | `[0, 4, 6, 10, 13, 15, 19]` |
| Gandhaara Grama (Narada der. sa-grama) | `edo22_gandhaara_narada_sa` | `[0, 4, 6, 10, 13, 16, 19]` |
| Murchhana Suddhasadja, Raga Harikambhoji, Palaiyazh | `edo22_murchhana_suddhasadja` | `[0, 4, 7, 9, 13, 16, 18]` |
| 22 tone "Just" Major, Madhyama Grama, Bilaval That, Murchhana Suddhamadhya | `edo22_scale_7_suddhamadhya` | `[0, 4, 7, 9, 13, 16, 20]` |
| Khamaj That | `edo22_khamaj_that` | `[0, 4, 7, 9, 13, 17, 18]` |
| Shadja Grama, Murchhana Uttaramandra, Shuddha Swara Saptaka | `edo22_shadja_grama` | `[0, 4, 7, 9, 13, 17, 20]` |
| Murchhana Sauviri, Kalyan That | `edo22_murchhana_sauviri` | `[0, 4, 7, 11, 13, 17, 20]` |
| Murchhana Asvakranta | `edo22_murchhana_asvakranta` | `[0, 4, 8, 11, 13, 17, 20]` |
| Raga Yaman | `edo22_raga_yaman` | `[0, 4, 8, 12, 13, 17, 21]` |
| Raga Saurashtra | `edo22_raga_saurashtra` | `[0, 1, 7, 9, 13, 14, 16, 20]` |
| Raga Bhatiyar | `edo22_raga_bhatiyar` | `[0, 2, 7, 9, 12, 13, 16, 20]` |
| Raga Mukhari | `edo22_raga_mukhari` | `[0, 3, 5, 9, 13, 15, 16, 18]` |
| Raga Anandabhairavi | `edo22_raga_anandabhairavi` | `[0, 4, 6, 9, 13, 15, 17, 19]` |
| Raga Mian Ki Malhar | `edo22_raga_mian_ki` | `[0, 4, 6, 9, 13, 17, 19, 21]` |
| Raga Suddha Kalyan | `edo22_raga_suddha_kalyan` | `[0, 4, 7, 9, 11, 13, 16, 20]` |
| Raga Yaman Kalyan | `edo22_raga_yaman_kalyan` | `[0, 4, 7, 9, 12, 13, 16, 21]` |
| Raga Gaud Sarang | `edo22_raga_gaud_sarang` | `[0, 4, 7, 9, 12, 13, 17, 20]` |
| Raga Bihag | `edo22_raga_bihag` | `[0, 4, 7, 9, 12, 13, 17, 21]` |
| Raga Khamaj | `edo22_raga_khamaj` | `[0, 4, 7, 9, 13, 16, 18, 21]` |
| Raga Ramdasi Malhar | `edo22_raga_ramdasi_malhar` | `[0, 4, 6, 8, 9, 13, 17, 19, 21]` |
| Raga Chayanat | `edo22_raga_chayanat` | `[0, 4, 7, 9, 12, 13, 16, 18, 21]` |
| Modern Indian gamut | `edo22_modern_indian_gamut` | `[0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 19, 20]` |
| Old Indian gamut | `edo22_old_indian_gamut` | `[0, 3, 5, 6, 7, 9, 12, 13, 16, 18, 19, 20]` |
| Murchhana Abhirudgata, Kafi That, Raga Bageshri | `edo22_murchhana_abhirudgata` | `[0, 3, 5, 9, 13, 16, 18]` |
| Raga Madhuvanti, Ambika | `edo22_raga_madhuvanti` | `[0, 4, 6, 11, 13, 17, 20]` |

## 24-EDO

124 definitions · 50 cents per EDO step.

| Scale | Identifier | Composition |
|---|---|---|
| Chromatic | `edo24_chroma` | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]` |
| Enharmonic Mixolydian | `edo24_enh_mixolydian` | `[0, 1, 2, 10, 11, 12, 20]` |
| Enharmonic Lydian | `edo24_enh_lydian` | `[0, 1, 9, 10, 11, 19, 23]` |
| Enharmonic Phrygian | `edo24_enh_phrygian` | `[0, 8, 9, 10, 18, 22, 23]` |
| Enharmonic Dorian | `edo24_enh_dorian` | `[0, 1, 2, 10, 14, 15, 16]` |
| Enharmonic Hypolydian | `edo24_enh_hypolydian` | `[0, 1, 9, 13, 14, 15, 23]` |
| Enharmonic Hypophrygian | `edo24_enh_hypophrygian` | `[0, 8, 12, 13, 14, 22, 23]` |
| Enharmonic Hypodorian | `edo24_enh_hypodorian` | `[0, 4, 5, 6, 14, 15, 16]` |
| Soft Diatonic Mixolydian | `edo24_soft_dia_mixolydian` | `[0, 2, 5, 10, 12, 15, 20]` |
| Soft Diatonic Lydian | `edo24_soft_dia_lydian` | `[0, 3, 8, 10, 13, 18, 22]` |
| Soft Diatonic Phrygian | `edo24_soft_dia_phrygian` | `[0, 5, 7, 10, 15, 19, 21]` |
| Soft Diatonic Dorian | `edo24_soft_dia_dorian` | `[0, 2, 5, 10, 14, 16, 19]` |
| Soft Diatonic Hypolydian | `edo24_soft_dia_hypolydian` | `[0, 3, 8, 12, 14, 17, 22]` |
| Soft Diatonic Hypophrygian | `edo24_soft_dia_hypophrygian` | `[0, 5, 9, 11, 14, 19, 21]` |
| Soft Diatonic Hypodorian | `edo24_soft_dia_hypodorian` | `[0, 4, 6, 9, 14, 16, 19]` |
| Neutral Diatonic Mixolydian, Maqam Ouchairan-Hussaini, Bayatan | `edo24_neutral_dia_mixolydian` | `[0, 3, 6, 10, 13, 16, 20]` |
| Neutral Diatonic Lydian, Dastgah-e Sehgah | `edo24_neutral_dia_lydian` | `[0, 3, 7, 10, 13, 17, 21]` |
| Neutral Diatonic Phrygian, Arabic Diatonic, Maqam Rast, Quasi-equal Heptatonic | `edo24_neutral_dia_phrygian` | `[0, 4, 7, 10, 14, 18, 21]` |
| Neutral Diatonic Dorian, Maqam Hussaini, Ushaq | `edo24_neutral_dia_dorian` | `[0, 3, 6, 10, 14, 17, 20]` |
| Neutral Diatonic Hypolydian, Maqam Sikah (Segah) | `edo24_neutral_dia_hypolydian` | `[0, 3, 7, 11, 14, 17, 21]` |
| Neutral Diatonic Hypophrygian | `edo24_neutral_dia_hypophrygian` | `[0, 4, 8, 11, 14, 18, 21]` |
| Neutral Diatonic Hypodorian, Miha'il Musaqa's mode: Egypt, Dastgah-e Sehgah, Maqam Nairuz | `edo24_neutral_dia_hypodorian` | `[0, 4, 7, 10, 14, 17, 20]` |
| Diatonic + Enharmonic Diesis Mixolydian | `edo24_dia_enh_mixolydian` | `[0, 1, 6, 10, 11, 16, 20]` |
| Diatonic + Enharmonic Diesis Lydian | `edo24_dia_enh_lydian` | `[0, 5, 9, 10, 15, 19, 23]` |
| Diatonic + Enharmonic Diesis Phrygian | `edo24_dia_enh_phrygian` | `[0, 4, 5, 10, 14, 18, 19]` |
| Diatonic + Enharmonic Diesis Dorian | `edo24_dia_enh_dorian` | `[0, 1, 6, 10, 14, 15, 20]` |
| Diatonic + Enharmonic Diesis Hypolydian | `edo24_dia_enh_hypolydian` | `[0, 5, 9, 13, 14, 19, 23]` |
| Diatonic + Enharmonic Diesis Hypophrygian | `edo24_dia_enh_hypophrygian` | `[0, 4, 8, 9, 14, 18, 19]` |
| Diatonic + Enharmonic Diesis Hypodorian | `edo24_dia_enh_hypodorian` | `[0, 4, 5, 10, 14, 15, 20]` |
| Chromatic/Enharmonic Mixolydian | `edo24_chroma_enh_mixolydian` | `[0, 1, 4, 10, 11, 14, 20]` |
| Chromatic/Enharmonic Lydian | `edo24_chroma_enh_lydian` | `[0, 3, 9, 10, 13, 19, 23]` |
| Chromatic/Enharmonic Phrygian | `edo24_chroma_enh_phrygian` | `[0, 6, 7, 10, 16, 20, 21]` |
| Chromatic/Enharmonic Dorian | `edo24_chroma_enh_dorian` | `[0, 1, 4, 10, 14, 15, 18]` |
| Chromatic/Enharmonic Hypolydian | `edo24_chroma_enh_hypolydian` | `[0, 3, 9, 13, 14, 17, 23]` |
| Chromatic/Enharmonic Hypophrygian | `edo24_chroma_enh_hypophrygian` | `[0, 6, 10, 11, 14, 20, 21]` |
| Chromatic/Enharmonic Hypodorian | `edo24_chroma_enh_hypodorian` | `[0, 4, 5, 8, 14, 15, 18]` |
| Neutral Mixolydian, Iced Blizzard | `edo24_neutral_mixolydian` | `[0, 3, 7, 10, 13, 17, 20]` |
| Neutral Lydian, Iced Major | `edo24_neutral_lydian` | `[0, 4, 7, 10, 14, 17, 21]` |
| Neutral Phrygian, Iced Locrian | `edo24_neutral_phrygian` | `[0, 3, 6, 10, 13, 17, 20]` |
| Neutral Dorian, Iced Fridgian, Misaelides 2nd Byzantine mode, Maqam Sikah Baladi, Maqamic-7 | `edo24_neutral_dorian` | `[0, 3, 7, 10, 14, 17, 21]` |
| Neutral Hypolydian, Iced Lydian, Mohajira-7 | `edo24_neutral_hypolydian` | `[0, 4, 7, 11, 14, 18, 21]` |
| Neutral Hypophrygian, Iced Mixolydian | `edo24_neutral_hypophrygian` | `[0, 3, 7, 10, 14, 17, 20]` |
| Neutral Hypodorian, Iced Dark Lydian | `edo24_neutral_hypodorian` | `[0, 4, 7, 11, 14, 17, 21]` |
| Ratio 1:2 Hemiolic Chromatic Mixolydian | `edo24_hemiolic_chroma_mixolydian` | `[0, 1, 3, 10, 11, 13, 20]` |
| Ratio 1:2 Hemiolic Chromatic Lydian | `edo24_hemiolic_chroma_lydian` | `[0, 2, 9, 10, 12, 19, 23]` |
| Ratio 1:2 Hemiolic Chromatic Phrygian | `edo24_hemiolic_chroma_phrygian` | `[0, 7, 8, 10, 17, 21, 22]` |
| Ratio 1:2 Hemiolic Chromatic Dorian | `edo24_hemiolic_chroma_dorian` | `[0, 1, 3, 10, 14, 15, 17]` |
| Ratio 1:2 Hemiolic Chromatic Hypolydian | `edo24_hemiolic_chroma_hypolydian` | `[0, 2, 9, 13, 14, 16, 23]` |
| Ratio 1:2 Hemiolic Chromatic Hypophrygian | `edo24_hemiolic_chroma_hypophrygian` | `[0, 7, 11, 12, 14, 21, 22]` |
| Ratio 1:2 Hemiolic Chromatic Hypodorian | `edo24_hemiolic_chroma_hypodorian` | `[0, 4, 5, 7, 14, 15, 17]` |
| Ethiopia | `edo24_ethiopia` | `[0, 2, 10, 13, 19]` |
| Spondeion | `edo24_spondeion` | `[0, 3, 10, 14, 17]` |
| Godzilla-5 | `edo24_godzilla_5` | `[0, 4, 9, 14, 19]` |
| Quasi-equal Pentatonic, Semaphore-5 | `edo24_quasi_equal_penta` | `[0, 5, 10, 14, 19]` |
| de Vries 5-tone | `edo24_de_vries_5` | `[0, 9, 11, 13, 22]` |
| Spondeiakos | `edo24_spondeiakos` | `[0, 1, 2, 10, 14, 16]` |
| Maqam Nawa | `edo24_maqam_nawa` | `[0, 2, 6, 10, 14, 17, 20]` |
| Second plagal Byzantine Liturgical mode | `edo24_second_plagal_byzantine` | `[0, 2, 9, 10, 14, 16, 23]` |
| Maqam Higaz-kar | `edo24_maqam_higaz_kar` | `[0, 2, 7, 10, 14, 16, 21]` |
| Maqam 'Ushshaq Turki, Urfa, Isfahan, Dastgah-e Shur | `edo24_maqam_ushshaq_turki` | `[0, 3, 6, 10, 14, 16, 20]` |
| Maqam Nahfat | `edo24_maqam_nahfat` | `[0, 3, 6, 10, 14, 18, 20]` |
| Maqam Saba | `edo24_maqam_saba_7` | `[0, 3, 6, 8, 14, 16, 20]` |
| Maqam Sabr Jadid | `edo24_maqam_sabr_jadid` | `[0, 3, 6, 8, 14, 16, 22]` |
| Maqam Qarjighar, Bayati Shuri | `edo24_maqam_qarjighar` | `[0, 3, 6, 10, 12, 18, 20]` |
| Maqam Hizam (Huzzam, El Houzam), Rahat al Arouah | `edo24_maqam_hizam_huzzam` | `[0, 3, 7, 9, 15, 17, 21]` |
| Maqam Su'ar, Naghmeh Abuata, Naghmeh Afshari | `edo24_maqam_su_ar` | `[0, 3, 7, 11, 13, 17, 21]` |
| Dastgah-e Homayun | `edo24_dastgah_e_homayun` | `[0, 3, 8, 10, 14, 16, 20]` |
| Dastgah-e Chahargah, Athanasopoulos’ Byzantine Liturgical Chromatic | `edo24_dastgah_e_chahargah` | `[0, 3, 8, 10, 14, 17, 22]` |
| Maqam ‘Awg ‘ara (Aug-ara) | `edo24_maqam_awg_ara` | `[0, 3, 9, 10, 15, 17, 23]` |
| Maqam Buselik | `edo24_maqam_buselik` | `[0, 4, 5, 10, 14, 16, 22]` |
| Dastgah-e Nava, Maqam Ushaq Masri | `edo24_dastgah_e_nava` | `[0, 4, 6, 10, 14, 17, 22]` |
| Naghmeh Esfahan | `edo24_naghmeh_esfahan` | `[0, 4, 6, 10, 14, 17, 22]` |
| Maqam Neuter | `edo24_maqam_neuter` | `[0, 4, 6, 12, 14, 16, 21]` |
| Maqam Suznak (Soznak) | `edo24_maqam_suznak` | `[0, 4, 7, 10, 14, 16, 22]` |
| Dance scale of Yi people: China | `edo24_dance_yi_people` | `[0, 4, 7, 10, 14, 18, 20]` |
| Maqam Mahur | `edo24_maqam_mahur` | `[0, 4, 7, 10, 14, 18, 22]` |
| Daniel-mode of Spanish-Arab Jews | `edo24_daniel_spanish_arab` | `[0, 4, 8, 10, 13, 14, 18]` |
| Maqam Jahargah (Jiharkah), Naghmeh Bayat-e Tork, Naghmeh Dashti | `edo24_maqam_jahargah` | `[0, 4, 8, 10, 14, 18, 21]` |
| Maqam ‘Ajam Murassah | `edo24_maqam_ajam_murassah` | `[0, 4, 8, 11, 14, 18, 22]` |
| Maqam Bayati | `edo24_maqam_bayati` | `[0, 3, 6, 10, 14, 16, 17, 20]` |
| Maqam Saba | `edo24_maqam_saba_8` | `[0, 3, 6, 8, 14, 16, 20, 22]` |
| Maqam Mansuri | `edo24_maqam_mansuri` | `[0, 3, 6, 8, 10, 14, 17, 20]` |
| Maqam Rast, Dilkashidah, Dilnishin | `edo24_maqam_rast` | `[0, 4, 7, 10, 14, 18, 20, 21]` |
| Maqam Suzidil 'ara | `edo24_maqam_suzidil_ara` | `[0, 4, 7, 8, 10, 14, 18, 20]` |
| Maqam Rahat al-Arwah | `edo24_maqam_rahat_al` | `[0, 3, 7, 9, 15, 17, 21, 23]` |
| Iraq | `edo24_iraq` | `[0, 3, 7, 10, 13, 17, 21, 23]` |
| Maqam Hijaz | `edo24_maqam_hijaz` | `[0, 2, 8, 10, 14, 16, 17, 20]` |
| Maqam Musta'ar | `edo24_maqam_musta_ar` | `[0, 3, 7, 11, 13, 14, 17, 21]` |
| Maqam Farahnak | `edo24_maqam_farahnak` | `[0, 3, 7, 11, 15, 17, 21, 23]` |
| Maqam Bastanikar, Tarz Nuin | `edo24_maqam_bastanikar` | `[0, 3, 7, 10, 13, 15, 21, 23]` |
| Maqam Farah Faza, Maqam Nakriz | `edo24_maqam_farah_faza` | `[0, 4, 6, 12, 14, 18, 20, 21]` |
| Maqam Jabburi | `edo24_maqam_jabburi` | `[0, 3, 4, 6, 10, 14, 16, 20]` |
| Dalmonte 8-tone | `edo24_dalmonte_8` | `[0, 1, 5, 9, 11, 15, 19, 23]` |
| Spongework | `edo24_spongework` | `[0, 1, 6, 9, 10, 15, 18, 19]` |
| Freivald Lament | `edo24_freivald_lament` | `[0, 1, 4, 7, 11, 14, 18, 21]` |
| Progressive Enneatonic | `edo24_prog_enneatonic` | `[0, 1, 3, 6, 10, 14, 15, 17, 20]` |
| Triforce-9 | `edo24_triforce_9` | `[0, 3, 6, 8, 11, 14, 16, 19, 22]` |
| Maqam Huzzam | `edo24_maqam_huzzam` | `[0, 3, 7, 9, 11, 13, 15, 17, 21]` |
| de Vries 9-tone, Semaphore-9 | `edo24_de_vries_9` | `[0, 4, 5, 9, 10, 14, 15, 19, 20]` |
| Godzilla-9 | `edo24_godzilla_9` | `[0, 4, 8, 9, 13, 14, 18, 19, 23]` |
| Maqam Shawq Afza | `edo24_maqam_shawq_afza` | `[0, 4, 8, 10, 11, 14, 16, 18, 22]` |
| Xiangliu | `edo24_xiangliu` | `[0, 4, 8, 10, 11, 14, 18, 21, 22]` |
| Migration-10 | `edo24_migration_10` | `[0, 1, 4, 7, 8, 11, 14, 15, 18, 21]` |
| Neutral Hypolydian Decatonic, Mohajira-10 | `edo24_neutral_hypolydian_decatonic` | `[0, 1, 4, 7, 8, 11, 14, 17, 18, 21]` |
| Young Decatonic, Decimal-10 | `edo24_young_decatonic` | `[0, 2, 5, 7, 10, 12, 14, 17, 19, 22]` |
| Oljare Decatonic | `edo24_oljare_decatonic` | `[0, 2, 5, 7, 9, 12, 14, 17, 19, 21]` |
| Anguirus-10 | `edo24_anguirus_10` | `[0, 2, 4, 7, 9, 12, 14, 16, 19, 21]` |
| Neutral Dorian Decatonic, Maqamic-10 | `edo24_neutral_dorian_decatonic` | `[0, 3, 4, 7, 10, 11, 14, 17, 20, 21]` |
| Breed Decatonic | `edo24_breed_decatonic` | `[0, 3, 4, 7, 10, 13, 14, 17, 20, 21]` |
| Maqam Yakah | `edo24_maqam_yakah` | `[0, 4, 7, 8, 10, 11, 14, 18, 20, 21]` |
| Maqam Basandida | `edo24_maqam_basandida` | `[0, 4, 6, 7, 10, 12, 14, 18, 20, 21]` |
| Maqam Shawq Tarab | `edo24_maqam_shawq_tarab` | `[0, 2, 3, 6, 8, 10, 14, 16, 20, 22]` |
| Freivald-11 | `edo24_freivald_11` | `[0, 3, 5, 7, 9, 11, 14, 16, 18, 20, 22]` |
| Maqam Hayyan | `edo24_maqam_hayyan` | `[0, 4, 6, 7, 10, 12, 14, 16, 18, 21, 22]` |
| Hemiaug-12 | `edo24_hemiaug_12` | `[0, 5, 6, 7, 8, 13, 14, 15, 16, 21, 22, 23]` |
| Iceface | `edo24_iceface` | `[0, 3, 4, 7, 8, 10, 13, 14, 17, 18, 21, 22]` |
| Vaisvil's Mixed-Quarters | `edo24_vaisvil_mixed_quarters` | `[0, 1, 4, 6, 7, 10, 11, 14, 16, 17, 19, 22]` |
| Freivald-13 | `edo24_freivald_13` | `[0, 1, 3, 5, 7, 9, 11, 12, 14, 16, 18, 20, 22]` |
| de Vries 13-tone | `edo24_de_vries_13` | `[0, 1, 3, 5, 7, 9, 11, 13, 14, 16, 18, 20, 22]` |
| Agmon Diatonic DS5 | `edo24_agmon_dia_ds5` | `[0, 2, 4, 6, 8, 10, 11, 13, 15, 17, 19, 21, 23]` |
| Young Half-Octave Diatonic, Decimal-14 | `edo24_young_half_octave` | `[0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23]` |
| Anguirus-14 | `edo24_anguirus_14` | `[0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22]` |
| Godzilla-14 | `edo24_godzilla_14` | `[0, 3, 4, 7, 8, 9, 12, 13, 14, 17, 18, 19, 22, 23]` |
| Triforce-15 | `edo24_triforce_15` | `[0, 1, 3, 4, 6, 8, 9, 11, 12, 14, 16, 17, 19, 20, 22]` |
