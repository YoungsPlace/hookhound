# HookHound Marketing Review

Date: 2026-07-06
Reviewer lens: developer-tools positioning, open-source launch readiness, README conversion, and GitHub/npm first impression.

## Verdict

HookHound has a strong launch angle: it turns an embarrassing, concrete failure mode into a memorable product promise.

**Best current positioning:**

> Ship agent plugins that actually board.

This is clearer and more memorable than generic wording like “agent plugin linter.” The airport-security metaphor works because HookHound checks payloads, manifests, hooks, and CI readiness before release.

## Strengths

1. **Memorable mascot and metaphor**
   - Hookie the airport beagle is easy to remember.
   - The image explains the product before the reader reaches the first paragraph.

2. **Concrete pain**
   - Missing hook scripts, broken `${PLUGIN_ROOT}` paths, and unshipped `dist/` payloads are embarrassing release failures.
   - The README now says exactly what HookHound prevents.

3. **Fast path to value**
   - `npm exec --package hookhound@0.1.1 -- hookhound ...` lets users try it without installing globally.
   - GitHub Action snippet turns the tool into a PR gate quickly.

4. **Credibility through limits**
   - The README explicitly says what HookHound does not support yet.
   - This prevents overclaiming and makes the tool feel trustworthy.

5. **International access**
   - English, Chinese, and Korean READMEs make the launch friendlier to agent-tooling communities in multiple regions.

## Applied improvements

| Finding | Improvement applied |
| --- | --- |
| README needed a visual hook | Added `assets/hookie-hookhound-hero.webp` at the top. |
| Package usage was too implicit | Added direct `npm exec --package hookhound@0.1.1 -- hookhound ...` examples. |
| GitHub Action example should pin releases | Updated Action examples to `YoungsPlace/hookhound@v0.1.1`. |
| Non-English users had no entrypoint | Added `README.zh-CN.md` and `README.ko.md`. |
| The product could sound too broad | Added explicit unsupported/deferred scope boundaries. |
| Dogfooding findings could get buried | Added `docs/dogfood.md` and linked it from localized READMEs. |

## Recommended launch copy

Short social post:

> I built HookHound — a release gate for agent plugins. It sniffs broken hooks, missing manifests, unshipped `dist/` files, and npm payload mistakes before users do. Comes with a CLI, GitHub Action, and Hookie the airport beagle.

Longer launch post:

> Agent plugins are becoming real software packages, but the release tooling is still fragile. HookHound catches the boring failures that embarrass maintainers: hook scripts that do not ship, `${PLUGIN_ROOT}` paths that resolve wrong, manifests that drift, skills that reference missing agents, and npm payloads that omit generated files. Run it locally or add the GitHub Action as a PR gate.

## Next marketing experiments

1. Add a failing PR screenshot after the first real GitHub Action dogfood PR.
2. Create a short GIF or terminal recording: clean plugin passes, broken plugin fails with annotation.
3. Publish one issue titled “Dogfood: shell command parsing false positive” to show public honesty and roadmap discipline.
4. Share the `glm-hammer` dogfood result as an example of low-noise plugin scanning, if appropriate.
5. Add npm badges after v0.1.1 lands. **Done:** README badges now link to npm, the v0.1.1 GitHub release, and the license.

## Post-release launch sequence

1. **Now:** Share a launch thread with the airport-beagle hook, the concrete broken-release pain, dogfood proof, and the one-command trial.
2. **Next dogfood artifact:** Create a tiny failing PR or terminal recording that shows HookHound catching `missing-generated-hook-artifact`, GitHub annotations, and SARIF output.
3. **Trust move:** Note that the `ouroboros` shell-command false positive found during dogfood is already fixed on `main`, while the source/generated-agent reference gap remains visible in the dogfood report.
4. **Distribution:** Post to GitHub, npm package notes, X/Threads, Korean dev communities, and agent-tooling Discord/Slack communities with the same one-command CTA.
5. **Follow-up metric:** Track npm downloads, GitHub stars, dogfood false positives, SARIF/code-scanning interest, and how many users add the GitHub Action.

## Korean launch thread draft

1. Agent plugin도 이제 “스크립트 몇 개”가 아니라 릴리즈되는 소프트웨어입니다. 그런데 hook script 빠지고, `dist/` 안 실리고, manifest가 drift 나면 유저가 먼저 밟습니다.
2. 그래서 HookHound를 만들었습니다. 릴리즈 전에 Hookie라는 공항 보안견이 plugin 가방을 sniff해서 깨진 hook, 빠진 manifest, npm payload 실수를 잡습니다.
3. v0.1.1은 바로 실행됩니다: `npm exec --package hookhound@0.1.1 -- hookhound sniff --root .`
4. `main`에는 dogfood에서 나온 `python3 "${PLUGIN_ROOT}/..."` 류 shell command false positive까지 고쳤고, SARIF 출력도 붙였습니다.
5. GitHub Action으로 붙이면 PR마다 agent plugin 탑승 심사를 돌릴 수 있습니다: `uses: YoungsPlace/hookhound@v0.1.1`
6. 외부 repo 3개에 dogfood 했고, false positive도 숨기지 않고 문서화했습니다. 과장보다 증거가 더 오래갑니다.
7. Agent plugin 릴리즈 전에 한 번 짖게 하세요. 유저가 깨진 플러그인을 만나기 전에 Hookie가 먼저 짖습니다.

## Risk watch

- Do not call HookHound a general AI-agent app linter. It is a plugin/package release gate.
- Do not imply full Claude/Codex/ZCode marketplace support yet. Say “style” or “surfaces currently detected.”
- Do not hide the `ouroboros` false-positive finding; it is useful evidence for the next parser improvement.
