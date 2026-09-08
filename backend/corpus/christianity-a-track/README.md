# Christianity A-track candidate source

Official upstream: [World English Bible Protestant edition](https://ebible.org/engwebp/).
The publisher dedicates the text to the public domain; see its
[license statement](https://ebible.org/engwebp/copyright.htm).
The World English Bible name is a trademark; preserve the original wording when using that name.

One upstream edition provides **31 verses in 24 manually selected passages**. Every registered
passage is **candidate**, with no expert decisions. Public-domain evidence is not content,
tradition, safety or license-review approval. Do not use these files as an active index.

- `selections.json`: human-authored passage boundaries and emotion/concept tags, pending review.
- `upstream/selected.vpl.txt`: exact selected verse lines from the official VPL download, LF delimiters.
- `upstream/engwebp_about.htm`: original license/provenance notice from the downloaded archive.
- `upstream/source.json`: adapter metadata with a content-addressed upstream version.
- `upstream/provenance.json`: SHA-256 for ZIP, original entry, subset, license and selections.

The ZIP is 4,281,529 bytes. It was downloaded from
[the official archive](https://ebible.org/Scriptures/engwebp_vpl.zip) into a temporary directory.
The full Bible/ZIP is not committed; the reviewable subset and evidence are retained here.
`archiveEntryTimestamp` is the archive entry's timestamp, not a claimed translation revision date.
The source version uses the ZIP checksum so a changed upstream cannot silently reuse this snapshot.

To reproduce from a locally downloaded official ZIP, run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File script/prepare-a-track-source.ps1 -ArchivePath C:/path/engwebp_vpl.zip -OutputDirectory C:/path/new-a-track-snapshot
```

The script does not download, execute SQL/HTML, extract arbitrary ZIP paths, modify `.env`, or
create reviews. It requires a new output directory. Compare the new archive hash with the
recorded one; an upstream update is a new candidate version requiring fresh review.
The official VPL uses some BibleWorks abbreviations (PHI/JOH/JAM/1JO); the adapter maps these to
canonical book names without changing verse text. Empty source verses cannot be selected.

Korean labels are discovery metadata, **not Korean Bible translations**. Text remains `en-US`.
Keep commercial Korean translations out of this pilot and review their licenses separately before launch.
See [the phase 9 report](../../PHASE_9_CHRISTIANITY_A_TRACK.md) for review/build/evaluation commands.
