<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Temporary direct entry is restricted to Vite development on both client and server; production keeps Hub SSO and existing authenticated data handlers, so editor access cannot become a public login bypass.
- GOB automatic synchronization is scheduled once daily by Cloud cron through a secret-authenticated server route and a unique local-date claim; browsers only display the countdown and invoke manual synchronization, avoiding duplicate API work across sessions.
- Before publishing the daily GOB route, restore Hub access; after publishing, activate the existing `pc-gob-sync-diaria` cron job (currently paused until the endpoint is deployed).
- Whole-dataset dashboard and synchronization reads use stable ordered pagination via `lerTodasPaginas`; Data API request caps must not truncate totals, flags or synchronization comparisons.
