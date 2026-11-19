
# SMARTLIB Digital Gateway v2

Gateway replaces the five compact login tabs with four HTML access buttons and the SMARTLIBverse link. Admin and member forms retain their existing IDs and delegate to the existing doLogin function. OPAC and reservations use the existing public functions. LIBRA's existing robot opens the admin form. The old tab injector is removed and showLogin resets navigation after logout.

Urbanist is loaded once per page with display=swap. The shared --fn token supplies ordinary UI, form controls and charts. LIBRA inherits that token. The NILAM Digital page also loads Urbanist. Century Gothic call-number labels, monospace data entry, formal Arial print layouts and Times New Roman Arkib 9/08 remain intact. Member cards use Urbanist for screen previews and their original print font for output; card dimensions stay 55 × 85 mm.

## Original hero assets

The user supplied two PNG originals. They were encoded as WebP at quality 90 without resizing or cropping.

- assets/hero/smartlib-gateway-desktop.webp — native 1672 × 941, 448,386 bytes.
- assets/hero/smartlib-gateway-mobile.webp — native 1122 × 1402, 433,532 bytes.

These are the actual supplied dimensions. They were kept at native resolution. The picture element selects one resource and reserves the correct aspect ratio. Desktop and mobile checks show the full logo and title. The access cards occupy the lower image area and the rest of the page scrolls vertically.

The requested ./smartlibverse/ folder is absent from main. Its production URL returned HTTP 404 on 19 November 2026. The Gateway contains the requested link. The existing game source or correct delivery location is required to validate that entry. NILAM Digital remains at its existing location.

## Validation

- 25 Node unit tests passed; 4 pre-existing optional private dataset/browser tests were skipped.
- All inline scripts and gateway.js passed JavaScript parsing.
- Local Chrome UI checked Admin and member forms, synthetic login transport, returning to Gateway after logout, OPAC opening, public reservation form opening and LIBRA panel opening. Browser data and auth were synthetic. No reservation or reading data was submitted.
- Computed body and input font families were Urbanist.
- Gateway horizontal overflow was absent at 320, 390, 768 and 1440 CSS pixels. Access cards exceeded 44 px.
- Native iPhone Safari, physical barcode scanning, physical card printing, live Gemini generation and authenticated production regression remain unverified.
- Desktop and mobile screenshots were inspected with the supplied hero images. No horizontal overflow was observed.
- Backend Apps Script files, stock calculations, account verification, barcode generation and formal print functions have no source changes.

The source is prepared for publication to GitHub Pages from main after source and visual checks. The missing SMARTLIBverse folder is an existing repository dependency.

Regression inspection also found that the existing Denda & Lewat renderer uses a missing $ helper. Its source matches main before this change. The UI-only work leaves that business module intact; its browser smoke check is recorded as an existing failure.
