# Telling Listed Authors About Their Entry

Most registry entries were added by the maintainer, not by their authors. This kit prepares one short message per author: it says their project is listed, offers the claim and the badge, asks for a screenshot when the page has none, and gives a one-step way out. **Nothing is sent automatically.** You open each prepared link, read the message, and post it yourself.

## Generate the list

```bash
npm run outreach
```

It writes two files to `outreach/` (gitignored):

- `outreach/messages.md`: one ready-to-post message per author, in batches of 10, each with a link that opens the new issue (or discussion) on their repository with the title and text filled in.
- `outreach/authors.csv`: the same authors as a spreadsheet: entries, stars, maintenance, whether the page has a screenshot, and where to post.

Options:

| Option | Effect |
| :--- | :--- |
| `--github` | Asks the GitHub API whether each repository has Issues and Discussions turned on and whether it is archived (one request per author; set `GITHUB_TOKEN`, since the anonymous limit is 60 an hour). Without it, every GitHub author gets an Issues link. |
| `--sent <file>` | Skips the GitHub usernames listed in that file, one per line (`#` comments allowed). Default: `outreach/sent.txt` when it exists. Add each author there after you post. |
| `--batch-size <n>` | Authors per batch (default 10). |

Who is left out: authors whose entries are all verified already (they found the site), and authors whose entries are all archived upstream (nobody reads those repositories). The skipped authors are listed at the end of `messages.md`.

Order: authors with an actively maintained entry first, then entries with no maintenance data yet, then quiet ones; within each group, the most starred first. Large projects (10,000 stars or more) come last and are flagged: their issue trackers are for bugs, many require an issue template, and their maintainers are the least likely to add a badge. Prefer their Discussions, or skip them.

The "send a screenshot" line appears only when the entry's page shows no screenshot. Pages also use images from the upstream README, so run `npm run build:site` first: the script then reads the built pages in `dist/`.

## How to send

- **About 10 a week.** Unsolicited issues annoy some maintainers, and a burst of identical issues across GitHub looks like spam.
- **Discussions over Issues** when the repository has them (`--github` tells you); an issue is the next best place. Post on the author's most-starred listed repository, and mention every entry in one message.
- **Read each message before posting.** Change anything that sounds wrong for that project.
- **Removal requests come first.** When an author asks, remove the entry the same day and close their issue with a thank-you.
- **Record each send** in `outreach/sent.txt` so the next run skips them.

Do not start outreach before the claim flow (`claim-to-pr.yml`) is merged to `main`: the message links to it, and GitHub only runs issue workflows from the default branch.

## Message template

`npm run outreach` fills this in for each author. Edit the text between the markers; keep the `{{…}}` placeholders.

| Placeholder | Becomes |
| :--- | :--- |
| `{{github}}` | the author's GitHub username |
| `{{projects}}` | the entry names, as "A", "A and B", "A, B and C", or "A, B, C and 4 more" |
| `{{isAre}}` | "is" for one entry, "are" for several |
| `{{itThem}}` | "it" for one entry, "them" for several |
| `{{entryList}}` | one line per entry: page, claim link, removal link |
| `{{badges}}` | the badge Markdown for each entry, one per line |
| `{{?missingScreenshot}}` | at the start of a line: keeps that line only when an entry has no screenshot |

<!-- outreach-template:title -->
{{projects}} {{isAre}} listed on 0xTsoa
<!-- /outreach-template:title -->

<!-- outreach-template:body -->
Hi @{{github}},

Thanks for {{projects}}. I listed {{itThem}} on [0xTsoa](https://www.0xtsoa.dev), an open registry of Linux desktop setups, credited to you and linking back here:

{{entryList}}

Each page pins an exact commit, says in plain words what installing it changes, and offers a guided installer that shows its plan first, backs up files and can undo itself (`--rollback`).

A few optional things, only if you want them:

- **Claim {{itThem}}** to show "Verified by author" on the page: open the claim link above from this account.
- **Add the badge** to your README:
  ```markdown
  {{badges}}
  ```
{{?missingScreenshot}}- **Send a screenshot.** The page has no screenshot of your setup yet: reply with an image link, or use "Suggest an edit" on the page.

If you would rather not be listed, reply here or open the removal link above, and I will take it down.

Ny Harena, 0xTsoa maintainer
<!-- /outreach-template:body -->
