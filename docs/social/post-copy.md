# Social copy for the monorepo article

Companion to `sparse-checkout-card.png` (1200x675, exported at 2x). Upload the PNG as the post
image; the numbers live there so the text can stay short.

Framing: open with the problem so the reader has something to recognise, then the results. The
install finding sits at the end as a finding, not a headline.

All figures come from the article's fixture. Clones ran over `file://` on one machine, which
flatters the Git numbers, because the bytes you skip are the expensive part over a real network.

## X, single post

263 characters with the link (X counts any link as 23).

```text
Big monorepos get slow in three places: clone, install, build. Fixing one doesn't help the rest.

So I measured sparse checkout against a full clone:

clone 270→148 ms · .git halved · git status 49→13 ms · files 3,328→85
install: no measurable change
```

## X, three-post thread

Use this one to let the problem land before the numbers, and to give the install finding room.

Post 1:

```text
Big monorepos get slow in three places: clone, install, build.

They fail independently, so a fix for one does nothing for the others. That's why I stopped
assuming sparse checkout would speed everything up, and measured it.
```

Post 2:

```text
Benchmarked against a full clone, on a 407-project Rush fixture:

clone 270→148 ms · .git halved · git status 49→13 ms · files 3,328→85

The Git side is a real win.
```

Post 3:

```text
One thing didn't move: install time. 50.0 s vs 50.8 s over 11 cold runs, same 1.20 GiB on disk.

Install cost is the dependency graph, not the file count. Sparo's clone keeps every package.json
so Rush can still install.

Full write-up: [link]
```

## LinkedIn

Room for the detail, so let the problem carry the opener.

```text
Big monorepos get slow in three separate places: cloning, installing, and building. Those three
fail independently, so fixing one does nothing for the others.

That framing is why I stopped assuming sparse checkout would speed everything up, and measured it
against a plain full clone on a 407-project Rush fixture.

The Git side is a clear win:
- clone: 270 ms to 148 ms, 1.8x faster
- .git on disk: 1,836 to 924 KiB, half the size
- git status: 49 ms to 13 ms, 3.8x faster
- files on disk: 3,328 to 85, 97% fewer

One thing didn't move: install time. 50.0 s to 50.8 s across 11 cold runs, and common/temp came
out identical at 1.20 GiB.

Why sparse checkout can't help is mechanical: install cost is the dependency graph, not the number
of files on disk. Sparo's clone keeps every package.json, which is what lets Rush install from a
sparse tree at all. A smaller install is a separate lever: rush install --to.

The article also covers:
- what project selection (--to, --from, git:<ref>) actually saves, and why a change to a widely
  used package still rebuilds almost everything
- why the Rush build cache returns wrong output when your inputs are not declared
- a CI and CD design for apps that share one workspace
- when none of this is worth the setup cost

One caveat: the fixture is synthetic and the clones are local, which flatters the Git numbers.
The bytes you skip are the expensive part over a real network.

If you run Rush or Sparo at real scale, I would like to hear whether this matches what you see.

[link]
```

## Hashtags

Keep them off X; they cost characters you do not have. For LinkedIn, three at most, appended to
the end:

```text
#monorepo #buildsystems #devops
```

## Image

`sparse-checkout-card.png`, 2400x1350. Opens with the problem, then the wins, then the honest
note. Works as an X large-image card (16:9) and as a LinkedIn share image. The source is
`sparse-checkout-card.svg` if you want to change a number.
