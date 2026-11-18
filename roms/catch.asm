; ============================================================
;  CATCH-8 - an original mini game (CHIP-8, 64x32)
;  Catch the falling bytes with your paddle. Miss three and
;  it's game over. It gets faster every 5 catches.
;  Controls: 4 = left, 6 = right   (keyboard Q / E or arrows)
;  (c) Jimmy Kurc - MIT License
; ============================================================
;  V0-V5 scratch   V6 catches since speed-up   V7 score
;  V8 frames per fall step   V9 frame counter   VA paddle x
;  VB game-over flag   VC lives   VD,VE drop x,y

PADDLE_Y = 30

title:
  CLS
  LD V3, 11
  LD V5, 8
  LD V4, str_title - strings
  CALL draw_text
  LD V3, 17
  LD V5, 18
  LD V4, str_keys - strings
  CALL draw_text
  LD V0, K              ; wait for any key

start:
  CLS
  LD V7, 0
  LD V6, 0
  LD V8, 6
  LD V9, 0
  LD VA, 28
  LD VB, 0
  LD VC, 3
  CALL draw_score
  CALL draw_lives
  LD I, paddle
  LD V4, PADDLE_Y
  DRW VA, V4, 1
  CALL spawn

loop:
  LD V0, DT             ; frame sync (60 Hz)
  SE V0, 0
  JP loop
  LD V0, 1
  LD DT, V0

  LD V0, 4
  SKNP V0
  CALL move_left
  LD V0, 6
  SKNP V0
  CALL move_right

  ADD V9, 1             ; time to fall?
  LD V0, V9
  SUB V0, V8            ; VF = (V9 >= V8)
  SE VF, 1
  JP check_over
  LD V9, 0
  CALL drop_step
check_over:
  SE VB, 1
  JP loop

; --- game over --------------------------------------------
  CLS
  CALL draw_score
  LD V3, 5
  LD V5, 13
  LD V4, str_over - strings
  CALL draw_text
  LD V0, 60             ; ignore keys for a second
  LD DT, V0
over_wait:
  LD V0, DT
  SE V0, 0
  JP over_wait
  LD V0, K
  JP start

; --- paddle ------------------------------------------------
move_left:
  SNE VA, 0
  RET
  LD I, paddle
  LD V4, PADDLE_Y
  DRW VA, V4, 1         ; erase
  ADD VA, #FF
  DRW VA, V4, 1
  SE VF, 0              ; touched the drop?
  JP caught
  RET

move_right:
  SNE VA, 56
  RET
  LD I, paddle
  LD V4, PADDLE_Y
  DRW VA, V4, 1
  ADD VA, 1
  DRW VA, V4, 1
  SE VF, 0
  JP caught
  RET

; --- falling byte -------------------------------------------
drop_step:
  LD I, drop
  DRW VD, VE, 3         ; erase
  ADD VE, 1
  SNE VE, 31            ; fell past the paddle
  JP missed
  DRW VD, VE, 3
  SE VF, 0              ; landed on the paddle
  JP caught
  RET

spawn:
  RND VD, 63
  LD V0, 61
  SUB V0, VD            ; VF = (VD <= 61)
  SE VF, 1
  ADD VD, #E0           ; keep it on screen
  LD VE, 6
  LD I, drop
  DRW VD, VE, 3
  RET

caught:
  LD I, drop
  DRW VD, VE, 3         ; XOR erase restores the paddle
  LD V0, 2
  LD ST, V0
  CALL draw_score
  ADD V7, 1
  CALL draw_score
  ADD V6, 1
  SE V6, 5
  JP spawn
  LD V6, 0
  SE V8, 1              ; faster, down to 1 frame per step
  ADD V8, #FF
  JP spawn

missed:
  LD V0, 20
  LD ST, V0
  CALL draw_lives
  ADD VC, #FF
  CALL draw_lives
  SE VC, 0
  JP spawn
  LD VB, 1
  RET

; --- HUD ----------------------------------------------------
draw_score:
  LD I, bcd
  LD B, V7
  LD V2, [I]
  LD V3, 1
  LD V4, 0
  LD F, V0
  DRW V3, V4, 5
  ADD V3, 5
  LD F, V1
  DRW V3, V4, 5
  ADD V3, 5
  LD F, V2
  DRW V3, V4, 5
  RET

draw_lives:
  LD V5, VC
  LD V3, 61
  LD V4, 1
  LD I, heart
lives_loop:
  SNE V5, 0
  RET
  DRW V3, V4, 3
  ADD V3, #FC
  ADD V5, #FF
  JP lives_loop

; --- text: V3 = x, V5 = y, V4 = offset in `strings` ---------
draw_text:
  LD I, strings
  ADD I, V4
  LD V0, [I]
  SNE V0, #FF
  RET
  LD I, glyphs
  ADD I, V0
  DRW V3, V5, 5
  ADD V3, 6
  ADD V4, 1
  JP draw_text

; ============================================================
bcd:     DB 0, 0, 0
paddle:  DB 0b11111111
drop:    DB 0b11100000
         DB 0b10100000
         DB 0b11100000
heart:   DB 0b10100000
         DB 0b11100000
         DB 0b01000000

_ = 0
C = 5
A = 10
T = 15
H = 20
DASH = 25
EIGHT = 30
LT = 35
GT = 40
FOUR = 45
SIX = 50
G = 55
M = 60
E = 65
O = 70
VV = 75
RR = 80

strings:
str_title: DB C, A, T, C, H, DASH, EIGHT, #FF
str_keys:  DB FOUR, LT, _, GT, SIX, #FF
str_over:  DB G, A, M, E, _, O, VV, E, RR, #FF

glyphs:
  DB #00, #00, #00, #00, #00   ; space
  DB #F0, #80, #80, #80, #F0   ; C
  DB #60, #90, #F0, #90, #90   ; A
  DB #F8, #20, #20, #20, #20   ; T
  DB #90, #90, #F0, #90, #90   ; H
  DB #00, #00, #F0, #00, #00   ; -
  DB #F0, #90, #F0, #90, #F0   ; 8
  DB #20, #40, #80, #40, #20   ; <
  DB #80, #40, #20, #40, #80   ; >
  DB #90, #90, #F0, #10, #10   ; 4
  DB #F0, #80, #F0, #90, #F0   ; 6
  DB #F0, #80, #B0, #90, #F0   ; G
  DB #88, #D8, #A8, #88, #88   ; M
  DB #F0, #80, #F0, #80, #F0   ; E
  DB #F0, #90, #90, #90, #F0   ; O
  DB #88, #88, #88, #50, #20   ; V
  DB #E0, #90, #E0, #A0, #90   ; R
