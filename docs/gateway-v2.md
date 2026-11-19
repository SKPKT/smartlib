
# SMARTLIB Digital Gateway v2

Gateway replaces the five compact login tabs with four HTML access buttons and the SMARTLIBverse link. Admin and member forms retain their existing IDs and delegate to the existing doLogin function. OPAC and reservations use the existing public functions. LIBRA's existing robot opens the admin form. The old tab injector is removed and showLogin resets navigation after logout.

Urbanist is loaded once per page with display=swap. The shared --fn token supplies ordinary UI, form controls and charts. LIBRA inherits that token. The NILAM Digital page also loads Urbanist. Century Gothic call-number labels, monospace data entry, formal Arial print layouts and Times New Roman Arkib 9/08 remain intact. Member cards use Urbanist for screen previews and their original print font for output; card dimensions stay 55 × 85 mm.

## Required original assets

The two requested WebP files were absent from this task's attachments, repository and the searched local folders. Add the originals to these exact paths before production publication.

- assets/hero/smartlib-gateway-desktop.webp — 1920 × 1080.
- assets/hero/smartlib-gateway-mobile.webp — 1080 × 1350.

The picture element selects one resource and reserves the appropriate aspect ratio. No replacement image has been generated. Final composition and logo/title visibility need visual review using the originals.

The requested ./smartlibverse/ folder is also absent from main. Its production URL returned HTTP 404 on 19 November 2026. The Gateway contains the requested link. The existing game source or its correct delivery location is required to validate that entry. NILAM Digital remains in its existing folder.

## Validation

- 25 Node unit tests passed; 4 pre-existing optional private dataset/browser tests were skipped.
- All inline scripts and gateway.js passed JavaScript parsing.
- Local Chrome UI checked Admin and member forms, synthetic login transport, returning to Gateway after logout, OPAC opening, public reservation form opening and LIBRA panel opening. Browser data and auth were synthetic. No reservation or reading data was submitted.
- Computed body and input font families were Urbanist.
- Gateway horizontal overflow was absent at 320, 390, 768 and 1440 CSS pixels. Access cards exceeded 44 px.
- Native iPhone Safari, physical barcode scanning, physical card printing, live Gemini generation and authenticated production regression remain unverified.
- Full desktop and mobile composition screenshots remain drafts until original hero images are supplied.
- Backend Apps Script files, stock calculations, account verification, barcode generation and formal print functions have no source changes.

Production publication is pending the original hero resources and completion of visual acceptance. The feature branch is suitable for code review while those resources are supplied.
