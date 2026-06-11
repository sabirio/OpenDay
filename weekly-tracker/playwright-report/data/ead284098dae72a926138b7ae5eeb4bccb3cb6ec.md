# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 16-risk-logic.spec.js >> Risk logic >> risk-status-summary block shows all 7 risk rows
- Location: tests\e2e\16-risk-logic.spec.js:86:3

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /sign out/i }).first()
    - locator resolved to <button class="sidebar-logout-btn">Sign out</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div></div> from <main class="main-content">…</main> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div></div> from <main class="main-content">…</main> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    164 × waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <div></div> from <main class="main-content">…</main> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - heading "NORYX" [level=2] [ref=e5]
    - generic [ref=e6]:
      - generic [ref=e7]: Sabir Khairullin
      - generic [ref=e8]: Admin
    - navigation [ref=e9]:
      - link "Dashboard" [ref=e10] [cursor=pointer]:
        - /url: /
      - link "Projects" [ref=e11] [cursor=pointer]:
        - /url: /projects
      - link "Weekly Reports" [ref=e12] [cursor=pointer]:
        - /url: /weekly-reports
      - link "Site Visit" [ref=e13] [cursor=pointer]:
        - /url: /site-visit-select
      - link "Risk Dashboard" [ref=e14] [cursor=pointer]:
        - /url: /risk-engine
      - link "Users" [ref=e15] [cursor=pointer]:
        - /url: /admin/users
    - generic [ref=e16]:
      - button "Sign out" [ref=e17] [cursor=pointer]
      - generic [ref=e18]: by Sabir Khairullin
  - main [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - heading "Construction Dashboard" [level=1] [ref=e23]
          - paragraph [ref=e24]: PM Command Center — portfolio health, risks, blockers, actions, and opening readiness.
        - generic [ref=e25]: Wednesday, 27 May 2026
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: Total Projects
          - generic [ref=e29]: "9"
        - generic [ref=e30]:
          - generic [ref=e31]: Active
          - generic [ref=e32]: "9"
          - generic [ref=e33]: 0 closed
        - generic [ref=e34]:
          - generic [ref=e35]: At Risk
          - generic [ref=e36]: "0"
          - generic [ref=e37]: schedule issues
        - generic [ref=e38]:
          - generic [ref=e39]: Critical
          - generic [ref=e40]: "0"
          - generic [ref=e41]: immediate action
        - generic [ref=e42]:
          - generic [ref=e43]: Reports This Week
          - generic [ref=e44]: "6"
          - generic [ref=e45]: 6 total
        - generic [ref=e46]:
          - generic [ref=e47]: Opening <30 Days
          - generic [ref=e48]: "0"
          - generic [ref=e49]: proximity alert
      - generic [ref=e50]:
        - generic [ref=e51]:
          - generic [ref=e52]: 🔍
          - textbox "Search…" [ref=e53]
        - combobox [ref=e54] [cursor=pointer]:
          - option "All statuses" [selected]
          - option "On Track"
          - option "At Risk"
          - option "Delayed"
          - option "Critical"
          - option "No Report"
          - option "Missing/Overdue"
        - generic [ref=e55]: 9 / 9 projects
      - generic [ref=e56]:
        - generic [ref=e57]:
          - heading "Project Status Matrix" [level=2] [ref=e58]
          - generic [ref=e59]: Sorted by priority · click row to open project
        - table [ref=e61]:
          - rowgroup [ref=e62]:
            - row "Store Code Current Phase Progress Schedule Risk Level Blockers Support Required Alert Target Opening Days Left Latest Report Report Status" [ref=e63]:
              - columnheader "Store Code" [ref=e64]
              - columnheader "Current Phase" [ref=e65]
              - columnheader "Progress" [ref=e66]
              - columnheader "Schedule" [ref=e67]
              - columnheader "Risk Level" [ref=e68]
              - columnheader "Blockers" [ref=e69]
              - columnheader "Support Required" [ref=e70]
              - columnheader "Alert" [ref=e71]
              - columnheader "Target Opening" [ref=e72]
              - columnheader "Days Left" [ref=e73]
              - columnheader "Latest Report" [ref=e74]
              - columnheader "Report Status" [ref=e75]
          - rowgroup [ref=e76]:
            - row "▶ TEST-1779862746653 No report 0% — UNKNOWN — — No — — — Missing" [ref=e77] [cursor=pointer]:
              - cell "▶ TEST-1779862746653" [ref=e78]:
                - generic [ref=e79]:
                  - generic [ref=e81]: ▶
                  - strong [ref=e82]: TEST-1779862746653
              - cell "No report" [ref=e83]
              - cell "0%" [ref=e84]:
                - generic [ref=e87]: 0%
              - cell "—" [ref=e88]:
                - generic [ref=e89]: —
              - cell "UNKNOWN" [ref=e90]:
                - generic [ref=e91]: UNKNOWN
              - cell "—" [ref=e92]
              - cell "—" [ref=e93]
              - cell "No" [ref=e94]
              - cell "—" [ref=e95]
              - cell "—" [ref=e96]
              - cell "—" [ref=e97]
              - cell "Missing" [ref=e98]
            - row "TEST-1779862837524 No report 0% — UNKNOWN — — No — — — Missing" [ref=e99] [cursor=pointer]:
              - cell "TEST-1779862837524" [ref=e100]:
                - strong [ref=e103]: TEST-1779862837524
              - cell "No report" [ref=e104]
              - cell "0%" [ref=e105]:
                - generic [ref=e108]: 0%
              - cell "—" [ref=e109]:
                - generic [ref=e110]: —
              - cell "UNKNOWN" [ref=e111]:
                - generic [ref=e112]: UNKNOWN
              - cell "—" [ref=e113]
              - cell "—" [ref=e114]
              - cell "No" [ref=e115]
              - cell "—" [ref=e116]
              - cell "—" [ref=e117]
              - cell "—" [ref=e118]
              - cell "Missing" [ref=e119]
            - row "TEST-1779862984455 No report 0% — UNKNOWN — — No — — — Missing" [ref=e120] [cursor=pointer]:
              - cell "TEST-1779862984455" [ref=e121]:
                - strong [ref=e124]: TEST-1779862984455
              - cell "No report" [ref=e125]
              - cell "0%" [ref=e126]:
                - generic [ref=e129]: 0%
              - cell "—" [ref=e130]:
                - generic [ref=e131]: —
              - cell "UNKNOWN" [ref=e132]:
                - generic [ref=e133]: UNKNOWN
              - cell "—" [ref=e134]
              - cell "—" [ref=e135]
              - cell "No" [ref=e136]
              - cell "—" [ref=e137]
              - cell "—" [ref=e138]
              - cell "—" [ref=e139]
              - cell "Missing" [ref=e140]
            - row "TEST-1779863237254 No report 0% — UNKNOWN — — No — — — Missing" [ref=e141] [cursor=pointer]:
              - cell "TEST-1779863237254" [ref=e142]:
                - strong [ref=e145]: TEST-1779863237254
              - cell "No report" [ref=e146]
              - cell "0%" [ref=e147]:
                - generic [ref=e150]: 0%
              - cell "—" [ref=e151]:
                - generic [ref=e152]: —
              - cell "UNKNOWN" [ref=e153]:
                - generic [ref=e154]: UNKNOWN
              - cell "—" [ref=e155]
              - cell "—" [ref=e156]
              - cell "No" [ref=e157]
              - cell "—" [ref=e158]
              - cell "—" [ref=e159]
              - cell "—" [ref=e160]
              - cell "Missing" [ref=e161]
            - row "TEST-1779863591704 No report 0% — UNKNOWN — — No — — — Missing" [ref=e162] [cursor=pointer]:
              - cell "TEST-1779863591704" [ref=e163]:
                - strong [ref=e166]: TEST-1779863591704
              - cell "No report" [ref=e167]
              - cell "0%" [ref=e168]:
                - generic [ref=e171]: 0%
              - cell "—" [ref=e172]:
                - generic [ref=e173]: —
              - cell "UNKNOWN" [ref=e174]:
                - generic [ref=e175]: UNKNOWN
              - cell "—" [ref=e176]
              - cell "—" [ref=e177]
              - cell "No" [ref=e178]
              - cell "—" [ref=e179]
              - cell "—" [ref=e180]
              - cell "—" [ref=e181]
              - cell "Missing" [ref=e182]
            - row "TEST-1779863698610 No report 0% — UNKNOWN — — No — — — Missing" [ref=e183] [cursor=pointer]:
              - cell "TEST-1779863698610" [ref=e184]:
                - strong [ref=e187]: TEST-1779863698610
              - cell "No report" [ref=e188]
              - cell "0%" [ref=e189]:
                - generic [ref=e192]: 0%
              - cell "—" [ref=e193]:
                - generic [ref=e194]: —
              - cell "UNKNOWN" [ref=e195]:
                - generic [ref=e196]: UNKNOWN
              - cell "—" [ref=e197]
              - cell "—" [ref=e198]
              - cell "No" [ref=e199]
              - cell "—" [ref=e200]
              - cell "—" [ref=e201]
              - cell "—" [ref=e202]
              - cell "Missing" [ref=e203]
            - row "TEST-1779900518001 No report 0% — UNKNOWN — — No — — — Missing" [ref=e204] [cursor=pointer]:
              - cell "TEST-1779900518001" [ref=e205]:
                - strong [ref=e208]: TEST-1779900518001
              - cell "No report" [ref=e209]
              - cell "0%" [ref=e210]:
                - generic [ref=e213]: 0%
              - cell "—" [ref=e214]:
                - generic [ref=e215]: —
              - cell "UNKNOWN" [ref=e216]:
                - generic [ref=e217]: UNKNOWN
              - cell "—" [ref=e218]
              - cell "—" [ref=e219]
              - cell "No" [ref=e220]
              - cell "—" [ref=e221]
              - cell "—" [ref=e222]
              - cell "—" [ref=e223]
              - cell "Missing" [ref=e224]
            - row "AA0011 Construction works 23% On Track LOW No No No 10/10/2026 136d 05/06/2026 -9d ago" [ref=e225] [cursor=pointer]:
              - cell "AA0011" [ref=e226]:
                - strong [ref=e229]: AA0011
              - cell "Construction works" [ref=e230]
              - cell "23%" [ref=e231]:
                - generic [ref=e235]: 23%
              - cell "On Track" [ref=e236]:
                - generic [ref=e237]: On Track
              - cell "LOW" [ref=e238]:
                - generic [ref=e239]: LOW
              - cell "No" [ref=e240]
              - cell "No" [ref=e241]
              - cell "No" [ref=e242]
              - cell "10/10/2026" [ref=e243]
              - cell "136d" [ref=e244]
              - cell "05/06/2026" [ref=e245]
              - cell "-9d ago" [ref=e246]:
                - generic [ref=e247]: "-9d ago"
            - row "ALA0077 Construction works 33% On Track LOW No No No 06/08/2026 71d 19/06/2026 -23d ago" [ref=e248] [cursor=pointer]:
              - cell "ALA0077" [ref=e249]:
                - strong [ref=e252]: ALA0077
              - cell "Construction works" [ref=e253]
              - cell "33%" [ref=e254]:
                - generic [ref=e258]: 33%
              - cell "On Track" [ref=e259]:
                - generic [ref=e260]: On Track
              - cell "LOW" [ref=e261]:
                - generic [ref=e262]: LOW
              - cell "No" [ref=e263]
              - cell "No" [ref=e264]
              - cell "No" [ref=e265]
              - cell "06/08/2026" [ref=e266]
              - cell "71d" [ref=e267]
              - cell "19/06/2026" [ref=e268]
              - cell "-23d ago" [ref=e269]:
                - generic [ref=e270]: "-23d ago"
      - generic [ref=e271]:
        - button "Overview" [ref=e272] [cursor=pointer]
        - button "Work Packages" [ref=e273] [cursor=pointer]
        - button "Progress" [ref=e274] [cursor=pointer]
        - button "Contractors" [ref=e275] [cursor=pointer]
        - button "Activity" [ref=e276] [cursor=pointer]
        - button "Site Visits" [ref=e277] [cursor=pointer]
      - generic [ref=e278]:
        - generic [ref=e279]:
          - generic [ref=e280]: Portfolio Health
          - generic [ref=e281]: Schedule status distribution
          - generic [ref=e282]:
            - generic [ref=e283]: On Track
            - generic [ref=e286]: "2"
          - generic [ref=e287]:
            - generic [ref=e288]: At Risk
            - generic [ref=e291]: "0"
          - generic [ref=e292]:
            - generic [ref=e293]: Delayed
            - generic [ref=e296]: "0"
          - generic [ref=e297]:
            - generic [ref=e298]: Critical
            - generic [ref=e301]: "0"
          - generic [ref=e302]:
            - generic [ref=e303]: No Report
            - generic [ref=e306]: "7"
          - generic [ref=e307]:
            - generic [ref=e308]:
              - generic [ref=e309]: "0"
              - generic [ref=e310]: Blockers
            - generic [ref=e311]:
              - generic [ref=e312]: "0"
              - generic [ref=e313]: Support
            - generic [ref=e314]:
              - generic [ref=e315]: "0"
              - generic [ref=e316]: Critical
        - generic [ref=e317]:
          - generic [ref=e318]: Opening Countdown
          - generic [ref=e319]: Projects sorted by nearest target opening date
          - table [ref=e321]:
            - rowgroup [ref=e322]:
              - row "Project Target Opening Days Left Progress Schedule Risk Flag" [ref=e323]:
                - columnheader "Project" [ref=e324]
                - columnheader "Target Opening" [ref=e325]
                - columnheader "Days Left" [ref=e326]
                - columnheader "Progress" [ref=e327]
                - columnheader "Schedule" [ref=e328]
                - columnheader "Risk" [ref=e329]
                - columnheader "Flag" [ref=e330]
            - rowgroup [ref=e331]:
              - row "ALA0077 Mega Alma-Ata 06/08/2026 71d 33% On Track LOW OK" [ref=e332] [cursor=pointer]:
                - cell "ALA0077 Mega Alma-Ata" [ref=e333]:
                  - generic [ref=e334]: ALA0077
                  - generic [ref=e335]: Mega Alma-Ata
                - cell "06/08/2026" [ref=e336]
                - cell "71d" [ref=e337]
                - cell "33%" [ref=e338]:
                  - generic [ref=e342]: 33%
                - cell "On Track" [ref=e343]:
                  - generic [ref=e344]: On Track
                - cell "LOW" [ref=e345]:
                  - generic [ref=e346]: LOW
                - cell "OK" [ref=e347]
              - row "AA0011 Mega mall 10/10/2026 136d 23% On Track LOW OK" [ref=e348] [cursor=pointer]:
                - cell "AA0011 Mega mall" [ref=e349]:
                  - generic [ref=e350]: AA0011
                  - generic [ref=e351]: Mega mall
                - cell "10/10/2026" [ref=e352]
                - cell "136d" [ref=e353]
                - cell "23%" [ref=e354]:
                  - generic [ref=e358]: 23%
                - cell "On Track" [ref=e359]:
                  - generic [ref=e360]: On Track
                - cell "LOW" [ref=e361]:
                  - generic [ref=e362]: LOW
                - cell "OK" [ref=e363]
      - generic [ref=e365]:
        - generic [ref=e366]:
          - generic [ref=e367]:
            - generic [ref=e368]:
              - generic [ref=e369]: TEST-1779862746653
              - generic [ref=e370]: Playwright Test Mall
              - generic [ref=e371]: Testville, Testland
            - generic [ref=e372]:
              - button "Copy link" [ref=e373] [cursor=pointer]
              - button "Close ×" [ref=e374] [cursor=pointer]
          - generic [ref=e375]:
            - generic [ref=e376]:
              - generic [ref=e377]: Type
              - text: New Opening
            - generic [ref=e378]:
              - generic [ref=e379]: Status
              - text: Active
        - generic [ref=e380]:
          - generic [ref=e381]:
            - generic [ref=e382]:
              - generic [ref=e383]: Contractor Report
              - generic [ref=e385]: 0%
              - generic [ref=e388]:
                - generic [ref=e389]:
                  - generic [ref=e390]: Last report
                  - generic [ref=e391]: Never reported
                - generic [ref=e392]:
                  - generic [ref=e393]: Total reports
                  - generic [ref=e394]: "0"
            - generic [ref=e395]:
              - generic [ref=e396]: PM Site Visit
              - generic [ref=e397]: No site visits recorded
            - generic [ref=e398]:
              - generic [ref=e399]:
                - generic [ref=e400]: Risk Summary
                - generic [ref=e401]: LOW
              - generic [ref=e402]:
                - generic [ref=e403]:
                  - generic [ref=e404]: Schedule
                  - generic [ref=e407]: On Track
                - generic [ref=e408]:
                  - generic [ref=e409]: Opening
                  - generic [ref=e412]: No Date
                - generic [ref=e413]:
                  - generic [ref=e414]: PM vs GC
                  - generic [ref=e417]: No Visit
                - generic [ref=e418]:
                  - generic [ref=e419]: Reports
                  - generic [ref=e422]: Missing/Overdue
                - generic [ref=e423]:
                  - generic [ref=e424]: Blocked
                  - generic [ref=e427]: "No"
                - generic [ref=e428]:
                  - generic [ref=e429]: Support
                  - generic [ref=e432]: None
                - generic [ref=e433]:
                  - generic [ref=e434]: Add. Works
                  - generic [ref=e437]: "No"
            - generic [ref=e438]:
              - generic [ref=e439]: Opening Readiness
              - generic [ref=e440]: No target date set
          - generic [ref=e441]:
            - generic [ref=e442]:
              - generic [ref=e443]: Data Confidence
              - generic [ref=e444]: Limited data
            - generic [ref=e454]: 0/8
```

# Test source

```ts
  1  | /**
  2  |  * Shared test helpers and credentials for the Construction PM Portal E2E suite.
  3  |  */
  4  | 
  5  | export const CREDENTIALS = {
  6  |   admin: {
  7  |     email: 'admin@construction.com',
  8  |     password: 'Admin',
  9  |     role: 'Admin',
  10 |   },
  11 |   pm: {
  12 |     email: 'pm@construction.com',
  13 |     password: 'Pm',
  14 |     role: 'PM',
  15 |   },
  16 |   contractor: {
  17 |     email: 'gc@construction.com',
  18 |     password: 'Gc',
  19 |     role: 'Contractor',
  20 |   },
  21 | };
  22 | 
  23 | /**
  24 |  * Log in via the login form and wait for navigation to complete.
  25 |  * @param {import('@playwright/test').Page} page
  26 |  * @param {{ email: string, password: string }} creds
  27 |  */
  28 | export async function login(page, creds) {
  29 |   await page.goto('/login');
  30 |   await page.locator('#email').fill(creds.email);
  31 |   await page.locator('#password').fill(creds.password);
  32 |   await page.locator('button[type="submit"]').click();
  33 |   // Wait until we leave the login page
  34 |   await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
  35 | }
  36 | 
  37 | /**
  38 |  * Log out via the "Sign out" button and wait for redirect to /login.
  39 |  * @param {import('@playwright/test').Page} page
  40 |  */
  41 | export async function logout(page) {
  42 |   // Find any button with "Sign out" text regardless of class/location
> 43 |   await page.getByRole('button', { name: /sign out/i }).first().click();
     |                                                                 ^ Error: locator.click: Test timeout of 90000ms exceeded.
  44 |   await page.waitForURL('**/login', { timeout: 15_000 });
  45 | }
  46 | 
```