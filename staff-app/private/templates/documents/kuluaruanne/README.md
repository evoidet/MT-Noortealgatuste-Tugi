# Kuluaruanne

`kuluaruanne.docx` is the canonical reusable template matched to the supplied
`kuluaruanne-KA-6559A6AD.docx.pdf`, including section 6 and both digital-signature
areas. The completed example PDF is not stored in the repository.

The application continues to load this private path. The previous template
contents have been replaced; the preparation script no longer generates an
expense template from the obsolete example in Downloads.

To validate the checked-in template or copy it to another template root:

```sh
python scripts/prepare-document-templates.py --only expense
python scripts/prepare-document-templates.py --only expense --output-root /path/to/templates/documents
```

This mode never reads or modifies the invoice source/template. An explicit
`--expense-source` must already be the current reusable template; preparation
rejects a source without its required fields and finance confirmation.

The DOCX preserves the existing submission tokens and adds
`financeApproverName`, `financeApproverRole`, `financeSignatureStatus`, and
`financeSignatureDate`. Section 6 reuses `requestedTotal`, so its amount agrees
with the costs total and application sentence. The application provides the
source's static finance approver and digital-signature wording; these are not
new form inputs or evidence that the document has already been signed.

See `artifact.md` for source measurements and fidelity notes.
