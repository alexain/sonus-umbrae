# Scale catalog

This catalog lists the scale definitions currently available for integration into Sonus Umbrae's pitch system. The source material is the set of Frap Tools USTA scale tables supplied with the project research notes.

A composition such as `[0, 2, 4, 7, 9]` is expressed as **zero-based EDO steps from the root**. In 12-EDO one step is 100 cents; in the other groups one step is `1200 / EDO` cents. The octave endpoint is implicit and is not repeated in the list.

The identifiers below are normalized for the Sonus Umbrae DSL: lowercase words joined with underscores. Non-12-EDO identifiers carry an `edo15_`, `edo19_`, `edo22_`, or `edo24_` prefix so that similarly named scales remain unambiguous across tuning systems.

> The catalog is stored in `src/language/scales.ts`. Use an identifier directly with `pitch scale`, for example `pitch scale C edo19_four_out_of_19 with range n1@3 n4@5`. Non-12-EDO scale ranges use one-based scale degrees in the form `n<degree>@<octave>`; 12-EDO scales may also use conventional note-name ranges such as `C3 C5`.

## 12-EDO

90 definitions · 100 cents per EDO step.

| Identifier | Scale | Composition |
|---|---|---|
| `chromatic` | Chromatic | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]` |
| `major_pentatonic_1` | Major Pentatonic 1 | `[0, 2, 4, 7, 9]` |
| `minor_pentatonic_2` | Minor Pentatonic 2 | `[0, 2, 5, 7, 10]` |
| `minor_pentatonic_3` | Minor Pentatonic 3 | `[0, 3, 5, 8, 10]` |
| `major_pentatonic_2` | Major Pentatonic 2 | `[0, 2, 5, 7, 9]` |
| `minor_pentatonic_1` | Minor Pentatonic 1 | `[0, 3, 5, 7, 10]` |
| `dominant_pentatonic` | Dominant Pentatonic | `[0, 2, 4, 7, 10]` |
| `whole_tone` | Whole Tone | `[0, 2, 4, 6, 8, 10]` |
| `augmented` | Augmented | `[0, 3, 4, 7, 8, 11]` |
| `prometheus` | Prometheus | `[0, 2, 4, 6, 9, 10]` |
| `hexatonic_blues` | Hexatonic Blues | `[0, 3, 5, 6, 7, 10]` |
| `ionian` | Ionian | `[0, 2, 4, 5, 7, 9, 11]` |
| `dorian` | Dorian | `[0, 2, 3, 5, 7, 9, 10]` |
| `phrygian` | Phrygian | `[0, 1, 3, 5, 7, 8, 10]` |
| `lydian` | Lydian | `[0, 2, 4, 6, 7, 9, 11]` |
| `mixolydian` | Mixolydian | `[0, 2, 4, 5, 7, 9, 10]` |
| `aeolian` | Aeolian | `[0, 2, 3, 5, 7, 8, 10]` |
| `locrian` | Locrian | `[0, 1, 3, 5, 6, 8, 10]` |
| `harmonic_minor_aeolian_sharp_7_m_harmonic_modes` | Harmonic Minor — Aeolian #7, m Harmonic Modes | `[0, 2, 3, 5, 7, 8, 11]` |
| `locrian_sharp_6` | Locrian #6 | `[0, 1, 3, 5, 6, 9, 10]` |
| `ionian_sharp_5` | Ionian #5 | `[0, 2, 4, 5, 8, 9, 11]` |
| `dorian_sharp_4` | Dorian #4 | `[0, 2, 3, 6, 7, 9, 10]` |
| `phrygian_dominant` | Phrygian Dominant | `[0, 1, 4, 5, 7, 8, 10]` |
| `lydian_sharp_2` | Lydian #2 | `[0, 3, 4, 6, 7, 9, 11]` |
| `ultralocrian` | Ultralocrian | `[0, 1, 3, 4, 6, 8, 9]` |
| `melodic_minor_jazz_minor` | Melodic Minor, Jazz Minor | `[0, 2, 3, 5, 7, 9, 11]` |
| `dorian_b9` | Dorian b9 | `[0, 1, 3, 5, 7, 9, 10]` |
| `lydian_augmented` | Lydian Augmented | `[0, 2, 4, 6, 8, 9, 11]` |
| `lydian_dominant` | Lydian Dominant | `[0, 2, 4, 6, 7, 9, 10]` |
| `mixolydian_b6` | Mixolydian b6 | `[0, 2, 4, 5, 7, 8, 10]` |
| `semilocrian_aeolian_b5` | Semilocrian, Aeolian b5 | `[0, 2, 3, 5, 6, 8, 10]` |
| `superlocrian` | Superlocrian | `[0, 1, 3, 4, 6, 8, 10]` |
| `double_harmonic_major` | Double Harmonic Major | `[0, 1, 4, 5, 7, 8, 11]` |
| `lydian_sharp_2_sharp_6` | Lydian #2 #6 | `[0, 3, 4, 6, 7, 10, 11]` |
| `ultraphrygian_ultralocrian_natural_5` | UltraPhrygian, Ultralocrian natural 5 | `[0, 1, 3, 4, 7, 8, 9]` |
| `double_harmonic_minor_hungarian_minor` | Double Harmonic Minor, Hungarian Minor | `[0, 2, 3, 6, 7, 8, 11]` |
| `mixolydian_b2_b5_oriental` | Mixolydian b2 b5, Oriental | `[0, 1, 4, 5, 6, 9, 10]` |
| `ionian_augmented_sharp_2` | Ionian Augmented #2 | `[0, 3, 4, 5, 8, 9, 11]` |
| `locrian_bb3_bb7` | Locrian bb3 bb7 | `[0, 1, 2, 5, 6, 8, 9]` |
| `hungarian_major` | Hungarian Major | `[0, 3, 4, 6, 7, 9, 10]` |
| `superlocrian_bb6_bb7` | Superlocrian bb6 bb7 | `[0, 1, 3, 4, 6, 7, 9]` |
| `harmonic_minor_b5` | Harmonic Minor b5 | `[0, 2, 3, 5, 6, 8, 11]` |
| `superlocrian_sharp_6` | Superlocrian #6 | `[0, 1, 3, 4, 6, 9, 10]` |
| `melodic_minor_sharp_5_jazz_minor_sharp_5` | Melodic Minor #5, Jazz Minor #5 | `[0, 2, 3, 5, 8, 9, 11]` |
| `dorian_b9_sharp_11` | Dorian b9 #11 | `[0, 1, 3, 6, 7, 9, 10]` |
| `lydian_augmented_sharp_3` | Lydian Augmented #3 | `[0, 2, 5, 6, 8, 9, 11]` |
| `harmonic_major_ionian_b6` | Harmonic Major, Ionian b6 | `[0, 2, 4, 5, 7, 8, 11]` |
| `dorian_b5` | Dorian b5 | `[0, 2, 3, 5, 6, 9, 10]` |
| `phrygian_b4` | Phrygian b4 | `[0, 1, 3, 4, 7, 8, 10]` |
| `lydian_b3` | Lydian b3 | `[0, 2, 3, 6, 7, 9, 11]` |
| `mixolydian_b9` | Mixolydian b9 | `[0, 1, 4, 5, 7, 9, 10]` |
| `lydian_augmented_sharp_2` | Lydian Augmented #2 | `[0, 3, 4, 6, 8, 9, 11]` |
| `locrian_bb7` | Locrian bb7 | `[0, 1, 3, 5, 6, 8, 9]` |
| `neapolitan_major` | Neapolitan Major | `[0, 1, 3, 5, 7, 9, 11]` |
| `leading_whole_tone` | Leading Whole-Tone | `[0, 2, 4, 6, 8, 10, 11]` |
| `lydian_augmented_dominant` | Lydian Augmented Dominant | `[0, 2, 4, 6, 8, 9, 10]` |
| `lydian_dominant_b6` | Lydian Dominant b6 | `[0, 2, 4, 6, 7, 8, 10]` |
| `major_locrian` | Major Locrian | `[0, 2, 4, 5, 6, 8, 10]` |
| `semilocrian_b4` | Semilocrian b4 | `[0, 2, 3, 4, 6, 8, 10]` |
| `superlocrian_bb3` | Superlocrian bb3 | `[0, 1, 2, 4, 6, 8, 10]` |
| `neapolitan_minor` | Neapolitan Minor | `[0, 1, 3, 5, 7, 8, 11]` |
| `lydian_sharp_6` | Lydian #6 | `[0, 2, 4, 6, 7, 10, 11]` |
| `mixolydian_augmented` | Mixolydian Augmented | `[0, 2, 4, 5, 8, 9, 10]` |
| `aeolian_sharp_4_hungarian_gipsy` | Aeolian #4, Hungarian Gipsy | `[0, 2, 3, 6, 7, 8, 10]` |
| `locrian_dominant` | Locrian Dominant | `[0, 1, 4, 5, 6, 8, 10]` |
| `ionian_sharp_2` | Ionian #2 | `[0, 3, 4, 5, 7, 9, 11]` |
| `ultralocrian_bb3` | Ultralocrian bb3 | `[0, 1, 2, 4, 6, 8, 9]` |
| `chromatic_hypolydian` | Chromatic Hypolydian | `[0, 1, 4, 6, 7, 8, 11]` |
| `chromatic_hypophrygian` | Chromatic Hypophrygian | `[0, 3, 5, 6, 7, 10, 11]` |
| `chromatic_hypodorian` | Chromatic Hypodorian | `[0, 2, 3, 4, 7, 8, 9]` |
| `chromatic_mixolydian` | Chromatic Mixolydian | `[0, 1, 2, 5, 6, 7, 10]` |
| `chromatic_lydian` | Chromatic Lydian | `[0, 1, 4, 5, 6, 9, 11]` |
| `chromatic_phrygian` | Chromatic Phrygian | `[0, 3, 4, 5, 8, 10, 11]` |
| `chromatic_dorian` | Chromatic Dorian | `[0, 1, 2, 5, 7, 8, 9]` |
| `chromatic_hypophrygian_inverse` | Chromatic Hypophrygian inverse | `[0, 1, 2, 5, 6, 7, 9]` |
| `chromatic_hypolydian_inverse` | Chromatic Hypolydian inverse | `[0, 1, 4, 5, 6, 8, 11]` |
| `chromatic_dorian_inverse` | Chromatic Dorian inverse | `[0, 3, 4, 5, 7, 10, 11]` |
| `chromatic_phrygian_inverse` | Chromatic Phrygian inverse | `[0, 1, 2, 4, 7, 8, 9]` |
| `chromatic_lydian_inverse` | Chromatic Lydian inverse | `[0, 1, 3, 6, 7, 8, 11]` |
| `chromatic_mixolydian_inverse` | Chromatic Mixolydian inverse | `[0, 2, 5, 6, 7, 10, 11]` |
| `chromatic_hypodorian_inverse` | Chromatic Hypodorian inverse | `[0, 3, 4, 5, 8, 9, 10]` |
| `bebop_major` | Bebop Major | `[0, 2, 4, 5, 7, 8, 9, 11]` |
| `bebop_dominant` | Bebop Dominant | `[0, 2, 4, 5, 7, 9, 10, 11]` |
| `bebop_dorian` | Bebop Dorian | `[0, 2, 3, 4, 5, 7, 9, 10]` |
| `bebop_dorian_alternative` | Bebop Dorian Alternative | `[0, 2, 3, 5, 7, 9, 10, 11]` |
| `bebop_minor` | Bebop Minor | `[0, 2, 3, 5, 7, 8, 9, 11]` |
| `bebop_locrian` | Bebop Locrian | `[0, 1, 3, 5, 6, 7, 8, 10]` |
| `bebop_harmonic_minor_natural_minor` | Bebop Harmonic Minor — Natural Minor | `[0, 2, 3, 5, 7, 8, 10, 11]` |
| `diminished_whole_half` | Diminished, Whole-Half | `[0, 2, 3, 5, 6, 8, 9, 11]` |
| `octatonic_half_whole` | Octatonic, Half-Whole | `[0, 1, 3, 4, 6, 7, 9, 10]` |

## 15-EDO

10 definitions · 80 cents per EDO step.

| Identifier | Scale | Composition |
|---|---|---|
| `edo15_chromatic` | Chromatic | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]` |
| `edo15_blackwood_6` | Blackwood | `[0, 4, 5, 9, 10, 14]` |
| `edo15_miller_porcupine_7` | 15 Tone Miller Porcupine 7 | `[0, 2, 4, 6, 9, 11, 13]` |
| `edo15_miller_porcupine_7_major` | 15 Tone Miller Porcupine 7 Major | `[0, 3, 5, 7, 9, 11, 13]` |
| `edo15_millers_kusiro` | Miller’s Kusiro | `[0, 1, 4, 6, 9, 10, 11, 13]` |
| `edo15_major_joness_porcupine_8` | 15 Tone Major, Jones’s Porcupine 8 | `[0, 2, 4, 5, 7, 9, 11, 13]` |
| `edo15_rempts_andal` | Rempt’s Andal | `[0, 2, 4, 5, 7, 9, 10, 12, 14]` |
| `edo15_blackwood_10` | Blackwood | `[0, 1, 3, 4, 6, 7, 9, 10, 12, 13]` |
| `edo15_major_minor_mix` | 15 Tone Major-Minor Mix | `[0, 3, 4, 5, 6, 9, 10, 11, 13, 14]` |
| `edo15_12_tone_chromatic` | 12 Tone Chromatic | `[0, 1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14]` |

## 19-EDO

24 definitions · 63.1579 cents per EDO step.

| Identifier | Scale | Composition |
|---|---|---|
| `edo19_chromatic` | Chromatic | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]` |
| `edo19_four_out_of_19` | Four out of 19 | `[0, 5, 9, 14]` |
| `edo19_five_out_of_19` | Five out of 19 | `[0, 4, 8, 12, 16]` |
| `edo19_quasi_equal_pentatonic` | Quasi-Equal Pentatonic | `[0, 4, 8, 11, 15]` |
| `edo19_yassers_hexad` | Yasser’s Hexad | `[0, 3, 6, 9, 12, 15]` |
| `edo19_oljare_diminished_1` | Oljare Diminished | `[0, 4, 5, 9, 10, 14, 15]` |
| `edo19_oljare_diminished_2` | Oljare Diminished | `[0, 5, 6, 11, 12, 13, 18]` |
| `edo19_oljare_octatonic` | Oljare Octatonic | `[0, 2, 4, 7, 9, 11, 14, 16]` |
| `edo19_oljare_pentaenharmonic` | Oljare Pentaenharmonic | `[0, 1, 4, 5, 8, 11, 12, 15, 16]` |
| `edo19_negris_ten_plus_nine` | Negri’s Ten Plus Nine | `[0, 2, 4, 6, 8, 10, 12, 14, 16, 18]` |
| `edo19_keenan_eleven_out_of_19` | Keenan eleven out of 19 | `[0, 3, 4, 5, 8, 9, 12, 13, 14, 17, 18]` |
| `edo19_krantz_eleven_out_of_19` | Krantz eleven out of 19 | `[0, 2, 4, 6, 8, 10, 11, 13, 14, 16, 18]` |
| `edo19_mclaren_eleven_out_of_19` | McLaren eleven out of 19 | `[0, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16]` |
| `edo19_gould_eleven_out_of_19` | Gould Eleven out of 19 | `[0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18]` |
| `edo19_meantone_chromatic_1_3_comma` | Meantone Chromatic (1/3 comma) | `[0, 1, 3, 5, 6, 8, 9, 11, 12, 14, 16, 17]` |
| `edo19_genus_diatonico_chromaticum` | Genus Diatonico-Chromaticum | `[0, 2, 3, 5, 6, 8, 9, 11, 13, 14, 16, 17]` |
| `edo19_yassers_supradiatonic` | Yasser’s Supradiatonic | `[0, 2, 3, 5, 6, 8, 10, 11, 13, 14, 16, 17]` |
| `edo19_mandelbaums_eight_out_of_19` | Mandelbaum’s Eight out of 19 | `[0, 2, 5, 7, 9, 12, 14, 16]` |
| `edo19_mandelbaums_nine_out_of_19` | Mandelbaum’s Nine out of 19 | `[0, 2, 4, 7, 9, 11, 13, 15, 17]` |
| `edo19_mandelbaums_ten_out_of_19` | Mandelbaum’s Ten out of 19 | `[0, 2, 4, 5, 7, 9, 11, 13, 15, 17]` |
| `edo19_mandelbaums_eleven_out_of_19` | Mandelbaum’s Eleven out of 19 | `[0, 2, 3, 5, 7, 9, 10, 12, 14, 16, 17]` |
| `edo19_mandelbaums_twelve_out_of_19` | Mandelbaum’s Twelve out of 19 | `[0, 1, 3, 4, 6, 8, 9, 11, 12, 14, 15, 17]` |
| `edo19_mandelbaums_thirteen_out_of_19` | Mandelbaum’s Thirteen out of 19 | `[0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18]` |
| `edo19_mandelbaums_fourteen_out_of_19` | Mandelbaum’s Fourteen out of 19 | `[0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 18]` |

## 22-EDO

123 definitions · 54.5455 cents per EDO step.

| Identifier | Scale | Composition |
|---|---|---|
| `edo22_chromatic` | Chromatic | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]` |
| `edo22_twelve_tone_chromatic_1_3_comma_positive` | Twelve-tone Chromatic (1/3-comma positive) | `[0, 3, 4, 5, 8, 9, 12, 13, 16, 17, 18, 21]` |
| `edo22_major` | 22 tone Major | `[0, 4, 8, 9, 13, 17, 21]` |
| `edo22_melodic_minor` | 22 tone Melodic Minor | `[0, 4, 6, 9, 13, 16, 20]` |
| `edo22_harmonic_minor` | 22 tone Harmonic Minor | `[0, 4, 6, 9, 13, 15, 20]` |
| `edo22_harmonic_major` | 22 tone Harmonic Major | `[0, 4, 7, 9, 13, 15, 20]` |
| `edo22_astrology_10` | 22 tone Astrology-10 | `[0, 3, 4, 7, 10, 11, 14, 15, 18, 21]` |
| `edo22_doublewide_10` | 22 tone Doublewide-10 | `[0, 1, 5, 6, 10, 11, 12, 16, 17, 21]` |
| `edo22_doublewide_14` | 22 tone Doublewide-14 | `[0, 1, 2, 5, 6, 7, 10, 11, 12, 13, 16, 17, 18, 21]` |
| `edo22_fleetwood_14` | 22 tone Fleetwood-14 | `[0, 1, 2, 5, 6, 7, 8, 11, 12, 13, 16, 17, 18, 19]` |
| `edo22_hedgehog_6` | 22 tone Hedgehog-6 | `[0, 5, 8, 11, 16, 19]` |
| `edo22_hedgehog_8` | 22 tone Hedgehog-8 | `[0, 2, 5, 8, 11, 13, 16, 19]` |
| `edo22_hedgehog_14` | 22 tone Hedgehog-14 | `[0, 2, 3, 5, 7, 8, 10, 11, 13, 14, 16, 18, 19, 21]` |
| `edo22_jubilee_12` | 22 tone Jubilee-12 | `[0, 2, 4, 5, 7, 9, 11, 13, 15, 16, 18, 20]` |
| `edo22_pajara_12` | 22 tone Pajara-12 | `[0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 18, 20]` |
| `edo22_supra_5_septimal_minor_pentatonic` | 22 tone Supra-5, Septimal Minor Pentatonic | `[0, 5, 9, 13, 18]` |
| `edo22_supra_7` | 22 tone Supra-7 | `[0, 4, 5, 9, 13, 17, 18]` |
| `edo22_supra_12` | 22 tone Supra-12 | `[0, 1, 4, 5, 8, 9, 10, 13, 14, 17, 18, 21]` |
| `edo22_urchin_14` | 22 tone Urchin-14 | `[0, 2, 4, 5, 7, 8, 10, 11, 13, 15, 16, 18, 19, 21]` |
| `edo22_wilson_pi_meantone` | 22 tone Wilson Pi-Meantone | `[0, 3, 4, 7, 8, 11, 12, 13, 16, 17, 20, 21]` |
| `edo22_ionian_porcupine` | Ionian Porcupine | `[0, 4, 7, 9, 13, 16, 19]` |
| `edo22_dorian_porcupine` | Dorian Porcupine | `[0, 4, 6, 9, 13, 16, 19]` |
| `edo22_aeolian_porcupine` | Aeolian Porcupine | `[0, 3, 6, 9, 13, 15, 18]` |
| `edo22_major_porcupine` | Major Porcupine | `[0, 4, 7, 10, 13, 16, 20]` |
| `edo22_major_minor_porcupine` | Major-Minor Porcupine | `[0, 4, 7, 10, 13, 15, 19]` |
| `edo22_chameleon_porcupine` | Chameleon Porcupine | `[0, 4, 7, 10, 13, 17, 20]` |
| `edo22_symmetric_diminished_porcupine` | Symmetric Diminished Porcupine | `[0, 3, 6, 10, 12, 16, 19]` |
| `edo22_porcupine_15` | Porcupine-15 | `[0, 2, 3, 5, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21]` |
| `edo22_elevenplus` | Elevenplus | `[0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 18, 20]` |
| `edo22_hexachordal` | Hexachordal | `[0, 2, 4, 6, 8, 9, 11, 13, 15, 17, 19, 21]` |
| `edo22_noll_pseudo_diatonic` | Noll Pseudo-diatonic | `[0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21]` |
| `edo22_ballooning_rushes` | Ballooning Rushes | `[0, 3, 4, 10, 12, 18, 19]` |
| `edo22_crushed_oranges` | Crushed Oranges | `[0, 1, 4, 9, 10, 13, 18, 19]` |
| `edo22_kathartic_parts` | Kathartic Parts | `[0, 2, 3, 10, 12, 13, 20]` |
| `edo22_riveting_reds` | Riveting Reds | `[0, 1, 5, 6, 10, 12, 13, 17, 18]` |
| `edo22_rodentalia` | Rodentalia | `[0, 4, 5, 8, 9, 13, 14, 17, 18]` |
| `edo22_rezsuteks_percussion_scale` | Rezsutek’s Percussion Scale | `[0, 2, 5, 7, 10, 12, 15, 17, 20]` |
| `edo22_magic_7` | 22 tone Magic-7 | `[0, 6, 7, 13, 14, 15, 21]` |
| `edo22_magic_10` | 22 tone Magic-10 | `[0, 5, 6, 7, 8, 13, 14, 15, 20, 21]` |
| `edo22_magic_13` | 22 tone Magic-13 | `[0, 4, 5, 6, 7, 11, 12, 13, 14, 18, 19, 20, 21]` |
| `edo22_orwell_5` | 22 tone Orwell-5 | `[0, 5, 10, 15, 20]` |
| `edo22_orwell_9` | 22 tone Orwell-9 | `[0, 3, 5, 8, 10, 13, 15, 18, 20]` |
| `edo22_orwell_13` | 22 tone Orwell-13 | `[0, 1, 3, 5, 6, 8, 10, 11, 13, 15, 16, 18, 20]` |
| `edo22_superpythagorean` | 22 tone SuperPythagorean | `[0, 1, 4, 5, 6, 9, 10, 13, 14, 15, 18, 19]` |
| `edo22_millers_porcupine_7_major` | 22 tone Miller’s Porcupine-7 Major | `[0, 3, 7, 10, 13, 16, 19]` |
| `edo22_joness_porcupine_8` | 22 tone Jones's Porcupine-8 | `[0, 3, 6, 7, 10, 13, 16, 19]` |
| `edo22_alternate_proper_decatonic` | Alternate Proper Decatonic | `[0, 3, 4, 7, 9, 11, 13, 16, 18, 20]` |
| `edo22_exotic_symmetrical_decatonic` | Exotic Symmetrical Decatonic | `[0, 2, 4, 7, 8, 11, 13, 15, 18, 19]` |
| `edo22_standard_pentachordal_major` | Standard Pentachordal Major | `[0, 2, 4, 7, 9, 11, 13, 16, 18, 20]` |
| `edo22_static_symmetrical_major` | Static Symmetrical Major | `[0, 2, 4, 7, 9, 11, 13, 15, 18, 20]` |
| `edo22_alternate_pentachordal_major` | Alternate Pentachordal Major | `[0, 2, 5, 7, 9, 11, 13, 15, 18, 20]` |
| `edo22_dynamic_symmetrical_major` | Dynamic Symmetrical Major | `[0, 2, 5, 7, 9, 11, 13, 16, 18, 20]` |
| `edo22_static_symmetrical_minor` | Static Symmetrical Minor | `[0, 2, 4, 6, 9, 11, 13, 15, 17, 20]` |
| `edo22_alternate_pentachordal_minor` | Alternate Pentachordal Minor | `[0, 2, 4, 6, 8, 11, 13, 15, 17, 20]` |
| `edo22_dynamic_symmetrical_minor` | Dynamic Symmetrical Minor | `[0, 2, 4, 6, 8, 11, 13, 15, 17, 19]` |
| `edo22_major_quasi_equal_heptatonic` | Major quasi-equal Heptatonic | `[0, 4, 7, 10, 13, 16, 19]` |
| `edo22_minor_quasi_equal_heptatonic_millers_porcupine_7` | Minor quasi-equal Heptatonic, Miller's Porcupine-7 | `[0, 3, 6, 9, 13, 16, 19]` |
| `edo22_harmonic_whole_tone` | Harmonic Whole-Tone | `[0, 4, 7, 10, 14, 18]` |
| `edo22_nine_limit_consonant_whole_tone` | Nine-Limit Consonant Whole-Tone | `[0, 4, 7, 11, 15, 18]` |
| `edo22_blues` | 22 tone Blues | `[0, 6, 9, 10, 13, 19]` |
| `edo22_mode_of_tamil_matra` | 22 tone mode of Tamil Matra | `[0, 4, 8, 11, 13, 17, 20]` |
| `edo22_raga_kanakangi` | Raga Kanakangi | `[0, 2, 5, 9, 13, 15, 18]` |
| `edo22_raga_ramkali` | Raga Ramkali | `[0, 1, 7, 9, 10, 13, 14, 20]` |
| `edo22_raga_kharaharapriya_bhimpalasi` | Raga Kharaharapriya, Bhimpalasi | `[0, 4, 6, 9, 13, 17, 19]` |
| `edo22_natural_minor_darbari_kanada_gandhaara_grama_damodara_raga_darbari` | Twenty-two tone Natural Minor, Darbari Kanada, Gandhaara Grama (Damodara), Raga Darbari | `[0, 4, 6, 9, 13, 15, 19]` |
| `edo22_raga_vibhas_marva` | Raga Vibhas (marva) | `[0, 1, 7, 13, 16]` |
| `edo22_raga_saveri` | Raga Saveri | `[0, 2, 9, 13, 14]` |
| `edo22_raga_deskar` | Raga Deskar | `[0, 3, 7, 13, 16]` |
| `edo22_raga_suddha_malhar` | Raga Suddha Malhar | `[0, 3, 9, 13, 16]` |
| `edo22_raga_bhupali` | Raga Bhupali | `[0, 4, 7, 13, 17]` |
| `edo22_raga_hamsadhvani` | Raga Hamsadhvani | `[0, 4, 7, 13, 20]` |
| `edo22_raga_durga` | Raga Durga | `[0, 4, 9, 13, 17]` |
| `edo22_raga_malkauns` | Raga Malkauns | `[0, 6, 9, 15, 18]` |
| `edo22_raga_gurjari_todi` | Raga Gurjari Todi | `[0, 1, 5, 11, 14, 21]` |
| `edo22_raga_bauli` | Raga Bauli | `[0, 2, 7, 13, 15, 20]` |
| `edo22_raga_kambhoji` | Raga Kambhoji | `[0, 4, 7, 9, 13, 16]` |
| `edo22_raga_takka` | Raga Takka | `[0, 6, 9, 13, 15, 20]` |
| `edo22_raga_tilang` | Raga Tilang | `[0, 7, 9, 13, 18, 20]` |
| `edo22_raga_bilashkhani_todi` | Raga Bilashkhani Todi | `[0, 1, 5, 9, 13, 14, 18]` |
| `edo22_raga_asavari` | Raga Asavari | `[0, 1, 5, 9, 13, 14, 19]` |
| `edo22_raga_rampurmat_pilu` | Raga Rampurmat Pilu | `[0, 1, 5, 9, 13, 14, 21]` |
| `edo22_raga_varali` | Raga Varali | `[0, 1, 5, 12, 13, 14, 20]` |
| `edo22_todi_that` | Todi That | `[0, 1, 5, 12, 13, 14, 21]` |
| `edo22_raga_lalita` | Raga Lalita | `[0, 1, 7, 9, 11, 14, 21]` |
| `edo22_bhairav_that` | Bhairav That | `[0, 1, 7, 9, 13, 14, 21]` |
| `edo22_gandhaara_grama_somanatha` | Gandhaara Grama (Somanatha) | `[0, 2, 6, 9, 12, 15, 19]` |
| `edo22_murchhana_harinasva_bhairavi_that` | Murchhana Harinasva, Bhairavi That | `[0, 2, 6, 9, 13, 15, 19]` |
| `edo22_gandhaara_grama_popley_murchhana_matsarikrita` | Gandhaara Grama (Popley), Murchhana Matsarikrita | `[0, 2, 6, 10, 13, 15, 19]` |
| `edo22_raga_multani` | Raga Multani | `[0, 2, 6, 12, 13, 14, 21]` |
| `edo22_raga_marva` | Raga Marva | `[0, 2, 7, 11, 13, 17, 20]` |
| `edo22_purvi_that_raga_shri` | Purvi That, Raga Shri | `[0, 2, 7, 12, 13, 15, 20]` |
| `edo22_raga_puriya_kalyan` | Raga Puriya Kalyan | `[0, 2, 7, 12, 13, 16, 20]` |
| `edo22_gandhaara_grama_sarngadeva_der_ma_grama` | Gandhaara Grama (Sarngadeva der. ma-grama) | `[0, 3, 5, 9, 12, 14, 18]` |
| `edo22_gandhaara_grama_sarngadeva_der_sa_grama` | Gandhaara Grama (Sarngadeva der. sa-grama) | `[0, 3, 5, 9, 12, 15, 18]` |
| `edo22_murchhana_hrishyaka` | Murchhana Hrishyaka | `[0, 3, 7, 9, 13, 16, 18]` |
| `edo22_raga_jogiya` | Raga Jogiya | `[0, 3, 7, 9, 13, 16, 20]` |
| `edo22_minor_superpyth_7_raga_jaunpuri` | 22 tone Minor, Superpyth-7, Raga Jaunpuri | `[0, 4, 5, 9, 13, 14, 18]` |
| `edo22_just_minor_asavari_that` | 22 tone "Just" Minor, Asavari That | `[0, 4, 6, 9, 13, 15, 18]` |
| `edo22_gandhaara_grama_narada_der_ma_grama_murchhana_pauravi` | Gandhaara Grama (Narada der. ma-grama), Murchhana Pauravi | `[0, 4, 6, 10, 13, 15, 19]` |
| `edo22_gandhaara_grama_narada_der_sa_grama` | Gandhaara Grama (Narada der. sa-grama) | `[0, 4, 6, 10, 13, 16, 19]` |
| `edo22_murchhana_suddhasadja_raga_harikambhoji_palaiyazh` | Murchhana Suddhasadja, Raga Harikambhoji, Palaiyazh | `[0, 4, 7, 9, 13, 16, 18]` |
| `edo22_just_major_madhyama_grama_bilaval_that_murchhana_suddhamadhya` | 22 tone "Just" Major, Madhyama Grama, Bilaval That, Murchhana Suddhamadhya | `[0, 4, 7, 9, 13, 16, 20]` |
| `edo22_khamaj_that` | Khamaj That | `[0, 4, 7, 9, 13, 17, 18]` |
| `edo22_shadja_grama_murchhana_uttaramandra_shuddha_swara_saptaka` | Shadja Grama, Murchhana Uttaramandra, Shuddha Swara Saptaka | `[0, 4, 7, 9, 13, 17, 20]` |
| `edo22_murchhana_sauviri_kalyan_that` | Murchhana Sauviri, Kalyan That | `[0, 4, 7, 11, 13, 17, 20]` |
| `edo22_murchhana_asvakranta` | Murchhana Asvakranta | `[0, 4, 8, 11, 13, 17, 20]` |
| `edo22_raga_yaman` | Raga Yaman | `[0, 4, 8, 12, 13, 17, 21]` |
| `edo22_raga_saurashtra` | Raga Saurashtra | `[0, 1, 7, 9, 13, 14, 16, 20]` |
| `edo22_raga_bhatiyar` | Raga Bhatiyar | `[0, 2, 7, 9, 12, 13, 16, 20]` |
| `edo22_raga_mukhari` | Raga Mukhari | `[0, 3, 5, 9, 13, 15, 16, 18]` |
| `edo22_raga_anandabhairavi` | Raga Anandabhairavi | `[0, 4, 6, 9, 13, 15, 17, 19]` |
| `edo22_raga_mian_ki_malhar` | Raga Mian Ki Malhar | `[0, 4, 6, 9, 13, 17, 19, 21]` |
| `edo22_raga_suddha_kalyan` | Raga Suddha Kalyan | `[0, 4, 7, 9, 11, 13, 16, 20]` |
| `edo22_raga_yaman_kalyan` | Raga Yaman Kalyan | `[0, 4, 7, 9, 12, 13, 16, 21]` |
| `edo22_raga_gaud_sarang` | Raga Gaud Sarang | `[0, 4, 7, 9, 12, 13, 17, 20]` |
| `edo22_raga_bihag` | Raga Bihag | `[0, 4, 7, 9, 12, 13, 17, 21]` |
| `edo22_raga_khamaj` | Raga Khamaj | `[0, 4, 7, 9, 13, 16, 18, 21]` |
| `edo22_raga_ramdasi_malhar` | Raga Ramdasi Malhar | `[0, 4, 6, 8, 9, 13, 17, 19, 21]` |
| `edo22_raga_chayanat` | Raga Chayanat | `[0, 4, 7, 9, 12, 13, 16, 18, 21]` |
| `edo22_modern_indian_gamut` | Modern Indian gamut | `[0, 2, 4, 6, 7, 9, 11, 13, 15, 17, 19, 20]` |
| `edo22_old_indian_gamut` | Old Indian gamut | `[0, 3, 5, 6, 7, 9, 12, 13, 16, 18, 19, 20]` |
| `edo22_murchhana_abhirudgata_kafi_that_raga_bageshri` | Murchhana Abhirudgata, Kafi That, Raga Bageshri | `[0, 3, 5, 9, 13, 16, 18]` |
| `edo22_raga_madhuvanti_ambika` | Raga Madhuvanti, Ambika | `[0, 4, 6, 11, 13, 17, 20]` |

## 24-EDO

124 definitions · 50 cents per EDO step.

| Identifier | Scale | Composition |
|---|---|---|
| `edo24_chromatic` | Chromatic | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]` |
| `edo24_enharmonic_mixolydian` | Enharmonic Mixolydian | `[0, 1, 2, 10, 11, 12, 20]` |
| `edo24_enharmonic_lydian` | Enharmonic Lydian | `[0, 1, 9, 10, 11, 19, 23]` |
| `edo24_enharmonic_phrygian` | Enharmonic Phrygian | `[0, 8, 9, 10, 18, 22, 23]` |
| `edo24_enharmonic_dorian` | Enharmonic Dorian | `[0, 1, 2, 10, 14, 15, 16]` |
| `edo24_enharmonic_hypolydian` | Enharmonic Hypolydian | `[0, 1, 9, 13, 14, 15, 23]` |
| `edo24_enharmonic_hypophrygian` | Enharmonic Hypophrygian | `[0, 8, 12, 13, 14, 22, 23]` |
| `edo24_enharmonic_hypodorian` | Enharmonic Hypodorian | `[0, 4, 5, 6, 14, 15, 16]` |
| `edo24_soft_diatonic_mixolydian` | Soft Diatonic Mixolydian | `[0, 2, 5, 10, 12, 15, 20]` |
| `edo24_soft_diatonic_lydian` | Soft Diatonic Lydian | `[0, 3, 8, 10, 13, 18, 22]` |
| `edo24_soft_diatonic_phrygian` | Soft Diatonic Phrygian | `[0, 5, 7, 10, 15, 19, 21]` |
| `edo24_soft_diatonic_dorian` | Soft Diatonic Dorian | `[0, 2, 5, 10, 14, 16, 19]` |
| `edo24_soft_diatonic_hypolydian` | Soft Diatonic Hypolydian | `[0, 3, 8, 12, 14, 17, 22]` |
| `edo24_soft_diatonic_hypophrygian` | Soft Diatonic Hypophrygian | `[0, 5, 9, 11, 14, 19, 21]` |
| `edo24_soft_diatonic_hypodorian` | Soft Diatonic Hypodorian | `[0, 4, 6, 9, 14, 16, 19]` |
| `edo24_neutral_diatonic_mixolydian_maqam_ouchairan_hussaini_bayatan` | Neutral Diatonic Mixolydian, Maqam Ouchairan-Hussaini, Bayatan | `[0, 3, 6, 10, 13, 16, 20]` |
| `edo24_neutral_diatonic_lydian_dastgah_e_sehgah` | Neutral Diatonic Lydian, Dastgah-e Sehgah | `[0, 3, 7, 10, 13, 17, 21]` |
| `edo24_neutral_diatonic_phrygian_arabic_diatonic_maqam_rast_quasi_equal_heptatonic` | Neutral Diatonic Phrygian, Arabic Diatonic, Maqam Rast, Quasi-equal Heptatonic | `[0, 4, 7, 10, 14, 18, 21]` |
| `edo24_neutral_diatonic_dorian_maqam_hussaini_ushaq` | Neutral Diatonic Dorian, Maqam Hussaini, Ushaq | `[0, 3, 6, 10, 14, 17, 20]` |
| `edo24_neutral_diatonic_hypolydian_maqam_sikah_segah` | Neutral Diatonic Hypolydian, Maqam Sikah (Segah) | `[0, 3, 7, 11, 14, 17, 21]` |
| `edo24_neutral_diatonic_hypophrygian` | Neutral Diatonic Hypophrygian | `[0, 4, 8, 11, 14, 18, 21]` |
| `edo24_neutral_diatonic_hypodorian_mihail_musaqas_mode_egypt_dastgah_e_sehgah_maqam_nairuz` | Neutral Diatonic Hypodorian, Miha'il Musaqa's mode: Egypt, Dastgah-e Sehgah, Maqam Nairuz | `[0, 4, 7, 10, 14, 17, 20]` |
| `edo24_diatonic_plus_enharmonic_diesis_mixolydian` | Diatonic + Enharmonic Diesis Mixolydian | `[0, 1, 6, 10, 11, 16, 20]` |
| `edo24_diatonic_plus_enharmonic_diesis_lydian` | Diatonic + Enharmonic Diesis Lydian | `[0, 5, 9, 10, 15, 19, 23]` |
| `edo24_diatonic_plus_enharmonic_diesis_phrygian` | Diatonic + Enharmonic Diesis Phrygian | `[0, 4, 5, 10, 14, 18, 19]` |
| `edo24_diatonic_plus_enharmonic_diesis_dorian` | Diatonic + Enharmonic Diesis Dorian | `[0, 1, 6, 10, 14, 15, 20]` |
| `edo24_diatonic_plus_enharmonic_diesis_hypolydian` | Diatonic + Enharmonic Diesis Hypolydian | `[0, 5, 9, 13, 14, 19, 23]` |
| `edo24_diatonic_plus_enharmonic_diesis_hypophrygian` | Diatonic + Enharmonic Diesis Hypophrygian | `[0, 4, 8, 9, 14, 18, 19]` |
| `edo24_diatonic_plus_enharmonic_diesis_hypodorian` | Diatonic + Enharmonic Diesis Hypodorian | `[0, 4, 5, 10, 14, 15, 20]` |
| `edo24_chromatic_enharmonic_mixolydian` | Chromatic/Enharmonic Mixolydian | `[0, 1, 4, 10, 11, 14, 20]` |
| `edo24_chromatic_enharmonic_lydian` | Chromatic/Enharmonic Lydian | `[0, 3, 9, 10, 13, 19, 23]` |
| `edo24_chromatic_enharmonic_phrygian` | Chromatic/Enharmonic Phrygian | `[0, 6, 7, 10, 16, 20, 21]` |
| `edo24_chromatic_enharmonic_dorian` | Chromatic/Enharmonic Dorian | `[0, 1, 4, 10, 14, 15, 18]` |
| `edo24_chromatic_enharmonic_hypolydian` | Chromatic/Enharmonic Hypolydian | `[0, 3, 9, 13, 14, 17, 23]` |
| `edo24_chromatic_enharmonic_hypophrygian` | Chromatic/Enharmonic Hypophrygian | `[0, 6, 10, 11, 14, 20, 21]` |
| `edo24_chromatic_enharmonic_hypodorian` | Chromatic/Enharmonic Hypodorian | `[0, 4, 5, 8, 14, 15, 18]` |
| `edo24_neutral_mixolydian_iced_blizzard` | Neutral Mixolydian, Iced Blizzard | `[0, 3, 7, 10, 13, 17, 20]` |
| `edo24_neutral_lydian_iced_major` | Neutral Lydian, Iced Major | `[0, 4, 7, 10, 14, 17, 21]` |
| `edo24_neutral_phrygian_iced_locrian` | Neutral Phrygian, Iced Locrian | `[0, 3, 6, 10, 13, 17, 20]` |
| `edo24_neutral_dorian_iced_fridgian_misaelides_2nd_byzantine_mode_maqam_sikah_baladi_maqamic_7` | Neutral Dorian, Iced Fridgian, Misaelides 2nd Byzantine mode, Maqam Sikah Baladi, Maqamic-7 | `[0, 3, 7, 10, 14, 17, 21]` |
| `edo24_neutral_hypolydian_iced_lydian_mohajira_7` | Neutral Hypolydian, Iced Lydian, Mohajira-7 | `[0, 4, 7, 11, 14, 18, 21]` |
| `edo24_neutral_hypophrygian_iced_mixolydian` | Neutral Hypophrygian, Iced Mixolydian | `[0, 3, 7, 10, 14, 17, 20]` |
| `edo24_neutral_hypodorian_iced_dark_lydian` | Neutral Hypodorian, Iced Dark Lydian | `[0, 4, 7, 11, 14, 17, 21]` |
| `edo24_ratio_1_2_hemiolic_chromatic_mixolydian` | Ratio 1:2 Hemiolic Chromatic Mixolydian | `[0, 1, 3, 10, 11, 13, 20]` |
| `edo24_ratio_1_2_hemiolic_chromatic_lydian` | Ratio 1:2 Hemiolic Chromatic Lydian | `[0, 2, 9, 10, 12, 19, 23]` |
| `edo24_ratio_1_2_hemiolic_chromatic_phrygian` | Ratio 1:2 Hemiolic Chromatic Phrygian | `[0, 7, 8, 10, 17, 21, 22]` |
| `edo24_ratio_1_2_hemiolic_chromatic_dorian` | Ratio 1:2 Hemiolic Chromatic Dorian | `[0, 1, 3, 10, 14, 15, 17]` |
| `edo24_ratio_1_2_hemiolic_chromatic_hypolydian` | Ratio 1:2 Hemiolic Chromatic Hypolydian | `[0, 2, 9, 13, 14, 16, 23]` |
| `edo24_ratio_1_2_hemiolic_chromatic_hypophrygian` | Ratio 1:2 Hemiolic Chromatic Hypophrygian | `[0, 7, 11, 12, 14, 21, 22]` |
| `edo24_ratio_1_2_hemiolic_chromatic_hypodorian` | Ratio 1:2 Hemiolic Chromatic Hypodorian | `[0, 4, 5, 7, 14, 15, 17]` |
| `edo24_ethiopia` | Ethiopia | `[0, 2, 10, 13, 19]` |
| `edo24_spondeion` | Spondeion | `[0, 3, 10, 14, 17]` |
| `edo24_godzilla_5` | Godzilla-5 | `[0, 4, 9, 14, 19]` |
| `edo24_quasi_equal_pentatonic_semaphore_5` | Quasi-equal Pentatonic, Semaphore-5 | `[0, 5, 10, 14, 19]` |
| `edo24_de_vries_5_tone` | de Vries 5-tone | `[0, 9, 11, 13, 22]` |
| `edo24_spondeiakos` | Spondeiakos | `[0, 1, 2, 10, 14, 16]` |
| `edo24_maqam_nawa` | Maqam Nawa | `[0, 2, 6, 10, 14, 17, 20]` |
| `edo24_second_plagal_byzantine_liturgical_mode` | Second plagal Byzantine Liturgical mode | `[0, 2, 9, 10, 14, 16, 23]` |
| `edo24_maqam_higaz_kar` | Maqam Higaz-kar | `[0, 2, 7, 10, 14, 16, 21]` |
| `edo24_maqam_ushshaq_turki_urfa_isfahan_dastgah_e_shur` | Maqam 'Ushshaq Turki, Urfa, Isfahan, Dastgah-e Shur | `[0, 3, 6, 10, 14, 16, 20]` |
| `edo24_maqam_nahfat` | Maqam Nahfat | `[0, 3, 6, 10, 14, 18, 20]` |
| `edo24_maqam_saba_7` | Maqam Saba | `[0, 3, 6, 8, 14, 16, 20]` |
| `edo24_maqam_sabr_jadid` | Maqam Sabr Jadid | `[0, 3, 6, 8, 14, 16, 22]` |
| `edo24_maqam_qarjighar_bayati_shuri` | Maqam Qarjighar, Bayati Shuri | `[0, 3, 6, 10, 12, 18, 20]` |
| `edo24_maqam_hizam_huzzam_el_houzam_rahat_al_arouah` | Maqam Hizam (Huzzam, El Houzam), Rahat al Arouah | `[0, 3, 7, 9, 15, 17, 21]` |
| `edo24_maqam_suar_naghmeh_abuata_naghmeh_afshari` | Maqam Su'ar, Naghmeh Abuata, Naghmeh Afshari | `[0, 3, 7, 11, 13, 17, 21]` |
| `edo24_dastgah_e_homayun` | Dastgah-e Homayun | `[0, 3, 8, 10, 14, 16, 20]` |
| `edo24_dastgah_e_chahargah_athanasopoulos_byzantine_liturgical_chromatic` | Dastgah-e Chahargah, Athanasopoulos’ Byzantine Liturgical Chromatic | `[0, 3, 8, 10, 14, 17, 22]` |
| `edo24_maqam_awg_ara_aug_ara` | Maqam ‘Awg ‘ara (Aug-ara) | `[0, 3, 9, 10, 15, 17, 23]` |
| `edo24_maqam_buselik` | Maqam Buselik | `[0, 4, 5, 10, 14, 16, 22]` |
| `edo24_dastgah_e_nava_maqam_ushaq_masri` | Dastgah-e Nava, Maqam Ushaq Masri | `[0, 4, 6, 10, 14, 17, 22]` |
| `edo24_naghmeh_esfahan` | Naghmeh Esfahan | `[0, 4, 6, 10, 14, 17, 22]` |
| `edo24_maqam_neuter` | Maqam Neuter | `[0, 4, 6, 12, 14, 16, 21]` |
| `edo24_maqam_suznak_soznak` | Maqam Suznak (Soznak) | `[0, 4, 7, 10, 14, 16, 22]` |
| `edo24_dance_scale_of_yi_people_china` | Dance scale of Yi people: China | `[0, 4, 7, 10, 14, 18, 20]` |
| `edo24_maqam_mahur` | Maqam Mahur | `[0, 4, 7, 10, 14, 18, 22]` |
| `edo24_daniel_mode_of_spanish_arab_jews` | Daniel-mode of Spanish-Arab Jews | `[0, 4, 8, 10, 13, 14, 18]` |
| `edo24_maqam_jahargah_jiharkah_naghmeh_bayat_e_tork_naghmeh_dashti` | Maqam Jahargah (Jiharkah), Naghmeh Bayat-e Tork, Naghmeh Dashti | `[0, 4, 8, 10, 14, 18, 21]` |
| `edo24_maqam_ajam_murassah` | Maqam ‘Ajam Murassah | `[0, 4, 8, 11, 14, 18, 22]` |
| `edo24_maqam_bayati` | Maqam Bayati | `[0, 3, 6, 10, 14, 16, 17, 20]` |
| `edo24_maqam_saba_8` | Maqam Saba | `[0, 3, 6, 8, 14, 16, 20, 22]` |
| `edo24_maqam_mansuri` | Maqam Mansuri | `[0, 3, 6, 8, 10, 14, 17, 20]` |
| `edo24_maqam_rast_dilkashidah_dilnishin` | Maqam Rast, Dilkashidah, Dilnishin | `[0, 4, 7, 10, 14, 18, 20, 21]` |
| `edo24_maqam_suzidil_ara` | Maqam Suzidil 'ara | `[0, 4, 7, 8, 10, 14, 18, 20]` |
| `edo24_maqam_rahat_al_arwah` | Maqam Rahat al-Arwah | `[0, 3, 7, 9, 15, 17, 21, 23]` |
| `edo24_iraq` | Iraq | `[0, 3, 7, 10, 13, 17, 21, 23]` |
| `edo24_maqam_hijaz` | Maqam Hijaz | `[0, 2, 8, 10, 14, 16, 17, 20]` |
| `edo24_maqam_mustaar` | Maqam Musta'ar | `[0, 3, 7, 11, 13, 14, 17, 21]` |
| `edo24_maqam_farahnak` | Maqam Farahnak | `[0, 3, 7, 11, 15, 17, 21, 23]` |
| `edo24_maqam_bastanikar_tarz_nuin` | Maqam Bastanikar, Tarz Nuin | `[0, 3, 7, 10, 13, 15, 21, 23]` |
| `edo24_maqam_farah_faza_maqam_nakriz` | Maqam Farah Faza, Maqam Nakriz | `[0, 4, 6, 12, 14, 18, 20, 21]` |
| `edo24_maqam_jabburi` | Maqam Jabburi | `[0, 3, 4, 6, 10, 14, 16, 20]` |
| `edo24_dalmonte_8_tone` | Dalmonte 8-tone | `[0, 1, 5, 9, 11, 15, 19, 23]` |
| `edo24_spongework` | Spongework | `[0, 1, 6, 9, 10, 15, 18, 19]` |
| `edo24_freivald_lament` | Freivald Lament | `[0, 1, 4, 7, 11, 14, 18, 21]` |
| `edo24_progressive_enneatonic` | Progressive Enneatonic | `[0, 1, 3, 6, 10, 14, 15, 17, 20]` |
| `edo24_triforce_9` | Triforce-9 | `[0, 3, 6, 8, 11, 14, 16, 19, 22]` |
| `edo24_maqam_huzzam` | Maqam Huzzam | `[0, 3, 7, 9, 11, 13, 15, 17, 21]` |
| `edo24_de_vries_9_tone_semaphore_9` | de Vries 9-tone, Semaphore-9 | `[0, 4, 5, 9, 10, 14, 15, 19, 20]` |
| `edo24_godzilla_9` | Godzilla-9 | `[0, 4, 8, 9, 13, 14, 18, 19, 23]` |
| `edo24_maqam_shawq_afza` | Maqam Shawq Afza | `[0, 4, 8, 10, 11, 14, 16, 18, 22]` |
| `edo24_xiangliu` | Xiangliu | `[0, 4, 8, 10, 11, 14, 18, 21, 22]` |
| `edo24_migration_10` | Migration-10 | `[0, 1, 4, 7, 8, 11, 14, 15, 18, 21]` |
| `edo24_neutral_hypolydian_decatonic_mohajira_10` | Neutral Hypolydian Decatonic, Mohajira-10 | `[0, 1, 4, 7, 8, 11, 14, 17, 18, 21]` |
| `edo24_young_decatonic_decimal_10` | Young Decatonic, Decimal-10 | `[0, 2, 5, 7, 10, 12, 14, 17, 19, 22]` |
| `edo24_oljare_decatonic` | Oljare Decatonic | `[0, 2, 5, 7, 9, 12, 14, 17, 19, 21]` |
| `edo24_anguirus_10` | Anguirus-10 | `[0, 2, 4, 7, 9, 12, 14, 16, 19, 21]` |
| `edo24_neutral_dorian_decatonic_maqamic_10` | Neutral Dorian Decatonic, Maqamic-10 | `[0, 3, 4, 7, 10, 11, 14, 17, 20, 21]` |
| `edo24_breed_decatonic` | Breed Decatonic | `[0, 3, 4, 7, 10, 13, 14, 17, 20, 21]` |
| `edo24_maqam_yakah` | Maqam Yakah | `[0, 4, 7, 8, 10, 11, 14, 18, 20, 21]` |
| `edo24_maqam_basandida` | Maqam Basandida | `[0, 4, 6, 7, 10, 12, 14, 18, 20, 21]` |
| `edo24_maqam_shawq_tarab` | Maqam Shawq Tarab | `[0, 2, 3, 6, 8, 10, 14, 16, 20, 22]` |
| `edo24_freivald_11` | Freivald-11 | `[0, 3, 5, 7, 9, 11, 14, 16, 18, 20, 22]` |
| `edo24_maqam_hayyan` | Maqam Hayyan | `[0, 4, 6, 7, 10, 12, 14, 16, 18, 21, 22]` |
| `edo24_hemiaug_12` | Hemiaug-12 | `[0, 5, 6, 7, 8, 13, 14, 15, 16, 21, 22, 23]` |
| `edo24_iceface` | Iceface | `[0, 3, 4, 7, 8, 10, 13, 14, 17, 18, 21, 22]` |
| `edo24_vaisvils_mixed_quarters` | Vaisvil's Mixed-Quarters | `[0, 1, 4, 6, 7, 10, 11, 14, 16, 17, 19, 22]` |
| `edo24_freivald_13` | Freivald-13 | `[0, 1, 3, 5, 7, 9, 11, 12, 14, 16, 18, 20, 22]` |
| `edo24_de_vries_13_tone` | de Vries 13-tone | `[0, 1, 3, 5, 7, 9, 11, 13, 14, 16, 18, 20, 22]` |
| `edo24_agmon_diatonic_ds5` | Agmon Diatonic DS5 | `[0, 2, 4, 6, 8, 10, 11, 13, 15, 17, 19, 21, 23]` |
| `edo24_young_half_octave_diatonic_decimal_14` | Young Half-Octave Diatonic, Decimal-14 | `[0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23]` |
| `edo24_anguirus_14` | Anguirus-14 | `[0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22]` |
| `edo24_godzilla_14` | Godzilla-14 | `[0, 3, 4, 7, 8, 9, 12, 13, 14, 17, 18, 19, 22, 23]` |
| `edo24_triforce_15` | Triforce-15 | `[0, 1, 3, 4, 6, 8, 9, 11, 12, 14, 16, 17, 19, 20, 22]` |
