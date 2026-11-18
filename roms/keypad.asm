; ============================================================
;  KEYPAD - input tester (CHIP-8, 64x32)
;  Every key of the hex keypad lights up while it is held.
;  The big digit on the left is the last key pressed.
;  (c) Jimmy Kurc - MIT License
; ============================================================
;  V6 key index   V8 last key   V9 beep length

  CLS
  LD V9, 3
  LD V8, 0

  ; draw the 16 digits in keypad layout
  LD V6, 0
label_loop:
  LD I, positions
  ADD I, V6
  ADD I, V6
  LD V1, [I]            ; V0 = x, V1 = y of the key cell
  ADD V0, 2
  ADD V1, 1
  LD F, V6
  DRW V0, V1, 5
  ADD V6, 1
  SE V6, 16
  JP label_loop

  CALL draw_last

main:
  LD V6, 0
scan:
  LD I, state
  ADD I, V6
  LD V0, [I]            ; V0 = is the cell lit?
  LD V1, 0
  SKNP V6
  LD V1, 1              ; V1 = is the key held?
  SE V0, V1
  CALL toggle
  ADD V6, 1
  SE V6, 16
  JP scan
  JP main

toggle:
  LD I, state
  ADD I, V6
  LD V0, V1
  LD [I], V0            ; remember the new state
  SE V1, 0
  CALL pressed
  LD I, positions
  ADD I, V6
  ADD I, V6
  LD V1, [I]
  LD I, cell
  DRW V0, V1, 7         ; invert the cell
  RET

pressed:
  LD ST, V9
  CALL draw_last        ; erase
  LD V8, V6
  CALL draw_last        ; redraw
  RET

draw_last:
  LD V2, 2
  LD V3, 11
  LD HF, V8
  DRW V2, V3, 10
  RET

; ============================================================
cell:   DB #FF, #FF, #FF, #FF, #FF, #FF, #FF

; x, y of each key cell, indexed by key value
;   1 2 3 C
;   4 5 6 D
;   7 8 9 E
;   A 0 B F
positions:
  DB 26, 23   ; 0
  DB 14,  2   ; 1
  DB 26,  2   ; 2
  DB 38,  2   ; 3
  DB 14,  9   ; 4
  DB 26,  9   ; 5
  DB 38,  9   ; 6
  DB 14, 16   ; 7
  DB 26, 16   ; 8
  DB 38, 16   ; 9
  DB 14, 23   ; A
  DB 38, 23   ; B
  DB 50,  2   ; C
  DB 50,  9   ; D
  DB 50, 16   ; E
  DB 50, 23   ; F

state:  DB 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
