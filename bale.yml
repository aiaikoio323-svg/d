name: AI Pulse → Bale

# هر ۳۰ دقیقه: اخبار AI + توییتر افراد معروف → لب کلام فارسی → ربات بله
on:
  schedule:
    - cron: "*/30 * * * *"   # UTC — یعنی حدوداً هر نیم ساعت
  workflow_dispatch:
    inputs:
      mode:
        description: "run = ارسال عادی | discover = پیدا کردن شناسهٔ چت‌ها"
        type: choice
        default: run
        options: [run, discover]

permissions:
  contents: write             # برای commit کردن state.json (ضد ارسال تکراری)

concurrency:
  group: bale-bot
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 35
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: اجرای ربات
        env:
          BALE_TOKEN: ${{ secrets.BALE_TOKEN }}
          BALE_CHATS: ${{ secrets.BALE_CHATS }}
          GEMINI_KEY: ${{ secrets.GEMINI_KEY }}
          GLM_KEY: ${{ secrets.GLM_KEY }}
          MAX_POSTS: ${{ vars.MAX_POSTS }}
          MAX_AGE_H: ${{ vars.MAX_AGE_H }}
          TWITTER_ACCOUNTS: ${{ vars.TWITTER_ACCOUNTS }}
          TRUTH_ACCOUNTS: ${{ vars.TRUTH_ACCOUNTS }}
        run: node bot.js ${{ inputs.mode == 'discover' && '--discover' || '' }}

      # در حالت discover نیازی به ذخیرهٔ state نیست
      - name: ذخیرهٔ وضعیت (ضد تکرار + زنده ماندن کرون)
        if: ${{ inputs.mode != 'discover' }}
        run: |
          git config user.name "aipulse-bot"
          git config user.email "aipulse-bot@users.noreply.github.com"
          BR=$(git rev-parse --abbrev-ref HEAD)
          git add state.json
          if git diff --cached --quiet; then
            echo "state تغییری نکرد"
            exit 0
          fi
          git commit -m "state: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
          ok=0
          for i in 1 2 3; do
            # اگر دورهٔ قبل وسط merge مانده، اول پاکسازی کن
            git rebase --abort 2>/dev/null || true
            git merge --abort 2>/dev/null || true
            git fetch origin "$BR" 2>/dev/null || true
            if git merge --no-edit "origin/$BR" 2>/dev/null; then
              echo "merge: بدون تعارض"
            else
              echo "تعارض state.json — اتحاد دو نسخه با --merge-state…"
              node bot.js --merge-state || true
              git add state.json
              git commit -m "state: merge conflict resolved" || true
            fi
            if git push origin "HEAD:$BR" 2>/dev/null; then ok=1; break; fi
            echo "push نشد — تلاش $i از ۳ …"
            sleep 5
          done
          if [ $ok -eq 1 ]; then
            echo "✓ state ذخیره شد (ریپو زنده می‌ماند و خبر تکراری نمی‌رود)"
          else
            echo "push ناموفق — دورهٔ بعد جبران می‌شود"
          fi
