# E2E Manual Test Checklist

Run through these scenarios on a phone/tablet before deployment.

## Login Flow
- [ ] Open app → redirects to login.html
- [ ] Enter wrong password → shows error
- [ ] Enter correct credentials (demo/demo) → redirects to main app
- [ ] User name shows in header pill
- [ ] Click 退出 → redirects to login page, token cleared

## Create (创建)
- [ ] Select 创建 mode → type/stage/count/tray fields appear
- [ ] Fill in all fields → submit → toast "创建成功"
- [ ] Event appears in event log and my history
- [ ] New dishes appear in dish helper buttons

## Split (拆分)
- [ ] Select 拆分 mode → parent/tray/count fields appear
- [ ] Scan parent dish QR → input filled
- [ ] Submit → toast "拆分成功"
- [ ] Undo → toast "撤销成功", created dishes removed

## Merge (合并)
- [ ] Select 合并 mode → tray/target/parent queue fields appear
- [ ] Add 2+ parents via input or continuous scan
- [ ] Chip row shows queued parents with remove buttons
- [ ] Submit → toast "合并成功"

## Place (上架)
- [ ] Lock location → location badge shown, tray input enabled
- [ ] Add trays via input or continuous scan
- [ ] Submit → toast "上架 N 个盘子"
- [ ] Change location → resets queue

## Status (状态)
- [ ] Scan or enter dish ID → select status → submit
- [ ] Plant status updated

## Transfer (转移)
- [ ] Enter old dish + new dish → submit → toast "已转移"

## Undo (撤销)
- [ ] Click 撤销 → confirmation dialog
- [ ] Confirm → last operation reversed
- [ ] Click 撤销 again → "不能连续撤销" or no more operations

## QR Scanning
- [ ] Single scan: tap 扫码 → camera opens → scan QR → camera closes, input filled
- [ ] Continuous scan (连扫): tap 连扫 → camera stays open → scan multiple codes → each added to queue
- [ ] Duplicate code → toast warning, not added twice
- [ ] Close button closes camera overlay

## Offline Behavior
- [ ] Disable network → red "离线中" banner appears
- [ ] Tap submit while offline → toast "当前离线，无法提交"
- [ ] Re-enable network → banner disappears, state refreshes

## Event Log
- [ ] Type filter dropdown filters event list
- [ ] Click event → expands detail (ID, actor, metadata)
- [ ] Click again → collapses

## My History
- [ ] Shows only current user's events
- [ ] Type filter dropdown works
- [ ] Click to expand/collapse works

## Responsive
- [ ] On phone (< 768px): single-column, 540px max-width
- [ ] On tablet (≥ 768px): wider layout, 720px max-width, 2-column form grid

## Admin
- [ ] Click 标签 link → admin.html
- [ ] Generate dish QR codes → grid of QR labels appears
- [ ] Print → clean print layout, 5 columns
