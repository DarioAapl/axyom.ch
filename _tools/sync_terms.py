"""Rebuild terms.html from the PUBLISHED Termly terms of service.

Same approach as sync_privacy.py (static copy, no Termly embed), plus a short
list of CORRECTIONS. Termly's generator writes some template clauses that its
questionnaire cannot switch off and that are wrong for Axyom. The copy served on
axyom.ch is the binding version, so the corrections are applied here.

Each correction must match exactly once. If Termly changes its template and a
correction no longer matches, the script refuses to write, so a fix can never
silently disappear.

The text is maintained in Termly (website "Axyom", policy 5225d9e4-…). After
you publish a change in Termly, run:

    python3 _tools/sync_terms.py

then review the diff and commit. The Data Processing Addendum is not in Termly;
it lives in dpa.html and is edited by hand.
"""
import json
import pathlib
import re
import sys
import urllib.request

POLICY = "5225d9e4-96f9-4b29-8259-0b0f34e52ec7"
URL = f"https://app.termly.io/api/v1/consumer/policies/{POLICY}/content?lang=en"
OUT = pathlib.Path(__file__).resolve().parents[1] / "terms.html"

# Optional Termly markup between words ("licence" is wrapped in empty bdt tags).
T = r"(?:<bdt[^>]*></bdt>)*"

LICENCE = (
    "You keep all rights in your content. By making content available through the Services, "
    "including your product catalogue, store policies, web pages, instructions and your "
    "customers' messages, you grant us a non-exclusive, worldwide, royalty-free licence, for as "
    "long as you use the Services and for the deletion periods in our Data Processing Addendum, "
    "to host, store, copy, index, process, transmit to our sub-processors and display that "
    "content, solely to the extent needed to provide the Services to you. Personal data contained "
    "in your content is processed only as set out in our "
    '<a data-custom-class="link" href="https://axyom.ch/dpa.html">Data Processing Addendum</a>.'
)

# (why, pattern, replacement)
CORRECTIONS = [
    ("Axyom is a sole trader, not a registered company.",
     r", a company registered in" + T,
     ", a sole trader based in"),
    ("Termly prints the update-notice answer on its own, without a lead-in.",
     r'<bdt class="question">By email to the address associated with your account, before the changes take effect\.</bdt>',
     "We may update these Legal Terms from time to time. We will notify you of any changes by email "
     "to the address associated with your account, before the changes take effect."),
    ("Contradicts our answer: uninstalling the Shopify app ends the subscription immediately.",
     r" Your cancellation will take effect at the end of the current paid term\.",
     ""),
    ("Termly typo.",
     r" mONTH PERIOD",
     " MONTH PERIOD"),
    ("Merchants use Axyom for their business; a ban on commercial use would forbid the product.",
     r"The Services may not be used in connection with any commercial " + T + r"endeavours" + T
     + r" except those that are specifically endorsed or approved by us\.",
     "The Services are provided for use by businesses in connection with their own online stores and websites."),
    ("Same: 'any revenue-generating endeavour' is exactly what merchants use Axyom for.",
     r"Use the Services as part of any effort to compete with us or otherwise use the Services and/or the Content for any revenue-generating "
     + T + r"endeavour" + T + r" or commercial enterprise\.",
     "Use the Services as part of any effort to compete with us, or resell or provide the Services to "
     "third parties without our written permission."),
    ("Template licence lets us sell and publish merchant content incl. shoppers' messages; "
     "as a processor we may only use it to provide the service (GDPR Art. 28).",
     r"<strong>When you post Contributions, you grant us a " + T + r"licence" + T
     + r" \(including use of your name, trademarks, and logos\):&nbsp;</strong>By posting any Contributions, you grant us an unrestricted.*?through any media channels\.",
     "<strong>Licence to your content:&nbsp;</strong>" + LICENCE),
    ("Part of the same template licence.",
     r"This " + T + r"licence" + T + r" includes our use of your name, company name, and franchise name.*?commercial images you provide\.",
     "We will not use your name, logo or trademarks to promote Axyom without your prior permission."),
    ("Second copy of the template licence (section 9).",
     r"By posting your Contributions to any part of the Services(<bdt.*?</bdt></bdt>), you automatically grant.*?through any media channels\.",
     # keep the captured Termly tags so the markup stays balanced
     lambda m: m.group(1) + LICENCE),
    ("Rest of the section 9 template licence.",
     r"This " + T + r"licence" + T + r" will apply to any form, media, or technology now known.*?asserted in your Contributions\.",
     "You waive, to the extent permitted by law, any moral rights in your Contributions as against us "
     "in connection with providing the Services."),
    ("Merchant data and shoppers' messages are confidential, not 'non-confidential'.",
     r" As such, any Contributions you transmit may be treated as non-confidential and non-proprietary\.",
     ""),
    ("Same.",
     r"warrant and represent that your Submissions" + T + r" and/or Contributions" + T + r" do not constitute confidential information\.",
     "warrant and represent that you are entitled to provide your Submissions and/or Contributions to us."),
]

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Terms of Service — Axyom AI</title>
<meta name="description" content="The terms for merchants using Axyom AI, the Shopify app and the website assistant." />
<meta name="theme-color" content="#ffffff" />
<meta name="color-scheme" content="light" />
<link rel="canonical" href="https://axyom.ch/terms.html" />
<meta name="robots" content="index,follow" />
<style>
  html, body { background: #ffffff; color: #1a1a1a; margin: 0; }
  .legal { max-width: 46rem; margin: 0 auto; padding: 3rem 16px 6rem; overflow-wrap: anywhere; }
  .legal .back { display: inline-block; margin-bottom: 2rem; font: 15px/1.4 Arial, sans-serif; color: #1C5C87; }
  .legal .dpa-note { font: 15px/1.6 Arial, sans-serif; color: #1a1a1a; background: #f5f7f9; border-left: 3px solid #1C5C87; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 0 0 2rem; }
  .legal .dpa-note a { color: #1C5C87; }
  .legal table { display: block; overflow-x: auto; max-width: 100%; }
  .legal p, .legal li, .legal div { line-height: 1.6; }
</style>
</head>
<body>
<main class="legal">
<a class="back" href="/">&larr; Axyom AI</a>
<p class="dpa-note">Our <a href="/dpa.html">Data Processing Addendum</a> (GDPR Article 28) forms part of these terms. How we handle personal data for our own purposes is described in our <a href="/privacy.html">Privacy Policy</a>.</p>
<!-- Generated by _tools/sync_terms.py from the published Termly terms
     __POLICY__, with the corrections listed in that script.
     Do not edit by hand: change it in Termly, publish, re-run. -->
"""

TAIL = """
</main>
</body>
</html>
"""


def main() -> int:
    # Termly's edge refuses Python's default User-Agent with a 403.
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 axyom-terms-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        content = json.load(r)["content"]
    if "TERMS OF SERVICE" not in content or len(content) < 50_000:
        print("refusing: response does not look like the terms", file=sys.stderr)
        return 1
    if re.search(r"<script|<iframe|<img", content, re.I):
        print("refusing: terms HTML now contains scripts/iframes/images", file=sys.stderr)
        return 1
    for why, pattern, repl in CORRECTIONS:
        sub = repl if callable(repl) else (lambda m, r=repl: r)
        content, n = re.subn(pattern, sub, content, flags=re.S)
        if n != 1:
            print(f"refusing: correction matched {n} times, expected 1: {why}", file=sys.stderr)
            return 1
    # Never publish a phone number or a VAT claim we do not have.
    for bad in (r"\+41", r"77\s*531", r"VAT number", r"Oberland"):
        if re.search(bad, content):
            print(f"refusing: found {bad!r} in the terms", file=sys.stderr)
            return 1
    OUT.write_text(HEAD.replace("__POLICY__", POLICY) + content + TAIL, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
