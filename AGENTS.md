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

- Household pages reuse form/dialog controls in `src/components/flat/Forms.tsx` and checked operations in `src/lib/flat-actions.ts` to keep validation and feedback consistent.
- Financial changes and chore transitions use existing database RPCs rather than direct ledger writes so authorization and atomic accounting remain enforced.
- Custom portal roles remain separate from built-in administrator roles, with checked database RPCs and permission-based RLS; delegated roles cannot grant administrator or financial authority.
- Account settings use the authentication provider's email/password update and recovery flows; never expose passwords or store login credentials in application data.
- Household extras use typed page configuration and shared HubPage forms over hub_items; responses and status transitions use checked database RPCs for atomic voting, borrowing, and booking conflict checks.
