; ============================================================
;  BOUNCE - the CHIP-8 Studio boot demo (SUPER-CHIP, 128x64)
;  A chip bounces around the screen, DVD-logo style.
;  The counter in the corner shows how many walls it hit.
;  (c) Jimmy Kurc - MIT License
; ============================================================

  HIGH                  ; 128x64 SUPER-CHIP mode
  CLS

  ; --- title bar -------------------------------------------
  LD V3, 1              ; x
  LD V5, 1              ; y
  LD V4, 0              ; offset of the title string
  CALL draw_text

  LD I, rule            ; 8x1 line, drawn 16 times
  LD V3, 0
  LD V5, 7
draw_rule:
  DRW V3, V5, 1
  ADD V3, 8
  SE V3, 128
  JP draw_rule

  ; --- state -----------------------------------------------
  ; VA,VB = position  VC,VD = velocity  V7 = bounce counter
  LD V7, 0
  CALL draw_count
  LD VA, 20
  LD VB, 20
  LD VC, 1
  LD VD, 1
  LD I, logo
  DRW VA, VB, 0         ; N=0: 16x16 sprite

main:
  CALL wait_frame
  LD I, logo
  DRW VA, VB, 0         ; erase (XOR)
  ADD VA, VC
  ADD VB, VD

  SE VA, 0              ; left wall
  JP check_right
  CALL flip_x
check_right:
  SE VA, 112            ; right wall (128 - 16)
  JP check_top
  CALL flip_x
check_top:
  SE VB, 9              ; just below the title bar
  JP check_bottom
  CALL flip_y
check_bottom:
  SE VB, 48             ; bottom wall (64 - 16)
  JP redraw
  CALL flip_y
redraw:
  LD I, logo
  DRW VA, VB, 0
  JP main

; --- velocity flips: v = 0 - v ------------------------------
flip_x:
  LD V0, 0
  SUB V0, VC
  LD VC, V0
  JP bounced
flip_y:
  LD V0, 0
  SUB V0, VD
  LD VD, V0
bounced:
  LD V0, 2
  LD ST, V0             ; short blip
  CALL draw_count       ; erase old number
  ADD V7, 1
  CALL draw_count       ; draw new one
  RET

; --- 3-digit counter, top right -----------------------------
draw_count:
  LD I, bcd
  LD B, V7
  LD V2, [I]            ; V0..V2 = hundreds, tens, units
  LD V3, 114
  LD V4, 1
  LD F, V0
  DRW V3, V4, 5
  ADD V3, 5
  LD F, V1
  DRW V3, V4, 5
  ADD V3, 5
  LD F, V2
  DRW V3, V4, 5
  RET

; --- wait for the next 60 Hz frame --------------------------
wait_frame:
  LD V0, DT
  SE V0, 0
  JP wait_frame
  LD V0, 1
  LD DT, V0
  RET

; --- text: V3 = x, V5 = y, V4 = offset in `strings` ---------
draw_text:
  LD I, strings
  ADD I, V4
  LD V0, [I]            ; glyph offset, or #FF = end
  SNE V0, #FF
  RET
  LD I, glyphs
  ADD I, V0
  DRW V3, V5, 5
  ADD V3, 6
  ADD V4, 1
  JP draw_text

; ============================================================
;  data
; ============================================================
bcd:    DB 0, 0, 0
rule:   DB #FF

logo:   ; 16x16 chip, one DW per row
  DW 0b0110011001100110
  DW 0b0110011001100110
  DW 0b1111111111111111
  DW 0b1000000000000001
  DW 0b1000111000110001
  DW 0b1001000001001001
  DW 0b1001000001001001
  DW 0b1001000000110001
  DW 0b1001000001001001
  DW 0b1001000001001001
  DW 0b1000111000110001
  DW 0b1000000000000001
  DW 0b1000000000000001
  DW 0b1111111111111111
  DW 0b0110011001100110
  DW 0b0110011001100110

; glyph offsets (5 bytes per glyph)
G_SP = 0
G_C  = 5
G_H  = 10
G_I  = 15
G_P  = 20
G_DA = 25
G_8  = 30
G_S  = 35
G_T  = 40
G_U  = 45
G_D  = 50
G_O  = 55

strings:
  DB G_C, G_H, G_I, G_P, G_DA, G_8, G_SP, G_S, G_T, G_U, G_D, G_I, G_O, #FF

glyphs:
  DB #00, #00, #00, #00, #00   ; space
  DB #F0, #80, #80, #80, #F0   ; C
  DB #90, #90, #F0, #90, #90   ; H
  DB #E0, #40, #40, #40, #E0   ; I
  DB #F0, #90, #F0, #80, #80   ; P
  DB #00, #00, #F0, #00, #00   ; -
  DB #F0, #90, #F0, #90, #F0   ; 8
  DB #F0, #80, #F0, #10, #F0   ; S
  DB #F8, #20, #20, #20, #20   ; T
  DB #90, #90, #90, #90, #F0   ; U
  DB #E0, #90, #90, #90, #E0   ; D
  DB #F0, #90, #90, #90, #F0   ; O
