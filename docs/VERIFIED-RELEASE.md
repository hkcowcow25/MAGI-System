# Verified release pin

**Status:** User Notebook real-model verified (2026-09-11)

| Field | Value |
|-------|-------|
| Git commit (full) | `5fd5e8a308d012036416aeefdaecdda67886bfec` |
| Short | `5fd5e8a` |
| Branch | `feature/magi-web-council` |
| Includes | PR #1 stack (`feature/magi-st-mvp` @ `54abf393…`) + Part 2 Settings/Council + Council Missing-proposal fix |
| PRs | [#1](https://github.com/hkcowcow25/MAGI-System/pull/1) (base master), [#2](https://github.com/hkcowcow25/MAGI-System/pull/2) (base feature/magi-st-mvp) |

## What was verified (Notebook, user)

- `MAGI_MOCK_MODE=false`
- MELCHIOR: LM Studio `gemma4-12b-qat-uncensored-hauhaucs-balanced`
- BALTHASAR / CASPER: `https://api.x.ai/v1` `grok-4.6`
- Connection checks OK; Verdict and Council real-model paths reported working after Council prompt-split fix

## Not verified

- Synology NAS deploy
- SillyTavern E2E
- Voice / long-term memory

## Checkout

```bash
git fetch origin
git checkout 5fd5e8a308d012036416aeefdaecdda67886bfec
# or: git checkout feature/magi-web-council   # while tip remains this commit
```

Do not treat `master` as this pin until PR #1 and #2 are merged in order.
