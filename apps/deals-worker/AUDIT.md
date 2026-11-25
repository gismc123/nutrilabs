# Audit: rkoh46/kroger-cli-aio

Audited commit `ef50956` (2026-10-20), cloned to a scratch folder outside this repo.
Every file under `src/kroger_aio`, plus `install.sh`, `pyproject.toml`, the Windows
helpers, the PyInstaller spec, and the release workflow, was read in full. None of
its code was run. This project copies the technique and does not depend on the tool.

## Verdict

Safe to learn from. Nothing sends data to a third party, nothing phones home, and
the password never passes through the program. The parts this project needs (open a
headed browser, read the coupon list from inside the page) are small and were
rewritten in Node in `worker/`.

## What it does

| Area | Finding |
|---|---|
| Dependencies | `playwright` and `typer` (which pulls in `rich`). No other runtime packages. |
| install.sh | Runs `uv sync` and `playwright install chromium`. Nothing else, no sudo, no curl-to-shell. |
| Browser | Playwright's bundled Chromium, headed, persistent profile, `--no-sandbox`, no user agent override. |
| Session storage | `~/.kroger-aio/browser-profile` (cookies), plus `clipped_coupons.json`, `profile.json` (your email), `last_run.json`, `survey.json`. |
| Password | Never read. Login pre-fills the email, then polls only `password.value.length > 0` to know when to press Sign In. The value is never returned to Python. |
| Email | Asked once and saved in plain text in `profile.json`. Our port does not ask for or store the email at all. |

## Network calls

All go to the store domain (kroger.com or a banner site) from inside the browser page:

1. `GET /cl/coupons` (page load) and `GET /signin?redirectUrl=...` (login).
2. `GET /atlas/v1/savings-coupons/v1/coupons?filter.status=...&page.size=N&page.offset=M` (coupon list).
3. `POST /atlas/v1/savings-coupons/v1/clip-unclip` (clips coupons). **Not ported.** This project is read-only.
4. Account pages `/account/dashboard/`, `/account/pointssummary/`, `/mypurchases` (screen-scraped text). Not ported.
5. `survey.py` opens `kroger.com/feedback`, which redirects to Kroger's Qualtrics survey, and auto-answers it. Not ported.

No analytics, no telemetry, no update check, no request to any domain the author controls.

## Things to know

1. **Auto-filled survey answers.** `survey.py` submits canned answers to Kroger's
   feedback survey for fuel points. That is outside this project's purpose and was
   left out.
2. **Auto-clipping with unclip swaps.** `--free-space` unclips coupons to make room.
   Left out: this tool never changes the account.
3. **Stale endpoint.** As of 2026-11-25 the live site calls
   `/atlas/v1/savings-coupons/v2/coupons?projections=coupons.compact`. The v1 path in
   the tool now returns 403 Access Denied from Akamai. Our worker uses v2.
4. **`filter.status=active` alone returns zero coupons when signed out.** The page
   itself sends `filter.status=unclipped&filter.status=active`, which returns the
   full list. The worker uses the page's own filter pair.
5. **Signed-out access works.** The coupons page and its v2 API return all active
   coupons (394 on 2026-11-25) without logging in. The worker therefore runs signed
   out by default and only needs a login for account-only offers.
6. Single author, no stars, new. That is a reason to copy the technique, which we did.

## Host readiness (checked 2026-11-25)

| Need | Status |
|---|---|
| Desktop session | GNOME on Wayland, auto-login on seat0, Xwayland on `:0`. |
| Display attached | Yes. MagicMirror shows through a Firefox kiosk (`~/Documents/MagicMirror/scripts/kiosk.sh`), not through the container. |
| Playwright Chromium | Runs in a Docker image (`worker/Dockerfile`) and draws on `:0` through the Xwayland auth file. No host installs needed, so `uv` is not used. |
| Headed run | Verified: the window opened, the coupon page loaded, and a full read finished in 17 paced requests. |
