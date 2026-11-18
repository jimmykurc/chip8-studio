; ============================================================
;  HELLO - your first CHIP-8 program
;  Move the smiley with 2 / 4 / 6 / 8 (arrow keys).
;  Edit anything, then press "Assemble & run" (Ctrl+Enter).
; ============================================================

  CLS
  LD V0, 28             ; x
  LD V1, 12             ; y
  LD I, smiley
  DRW V0, V1, 8         ; draw an 8x8 sprite

loop:
  LD V2, DT             ; wait until the delay timer hits 0
  SE V2, 0
  JP loop
  LD V2, 2              ; then arm it again: 2/60 s per move
  LD DT, V2

  LD V3, V0             ; remember where we were
  LD V4, V1

  LD V5, 4              ; SKNP skips the next line
  SKNP V5               ; when the key is NOT held
  ADD V0, #FF           ; x - 1
  LD V5, 6
  SKNP V5
  ADD V0, 1             ; x + 1
  LD V5, 2
  SKNP V5
  ADD V1, #FF           ; y - 1
  LD V5, 8
  SKNP V5
  ADD V1, 1             ; y + 1

  SE V0, V3             ; redraw only if we moved
  JP moved
  SE V1, V4
  JP moved
  JP loop

moved:
  LD I, smiley
  DRW V3, V4, 8         ; XOR erases the old one...
  DRW V0, V1, 8         ; ...and draws the new one
  JP loop

smiley:
  DB 0b00111100
  DB 0b01000010
  DB 0b10100101
  DB 0b10000001
  DB 0b10100101
  DB 0b10011001
  DB 0b01000010
  DB 0b00111100
