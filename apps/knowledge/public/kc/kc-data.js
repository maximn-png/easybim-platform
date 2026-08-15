/* ============================================================
   EasyBIM Knowledge Center — content tree (real KC structure)
   Node formats accepted by the renderer:
     "string"                      → leaf topic (todo)
     ["Name", [ ...children ]]     → branch
     {n:"Name", s:"done|active", custom:true, muted:true, c:[...]} → full node
   ============================================================ */
window.KC_TREE = {

  /* ═══ WORKSPACE 0 — LOGISTICS & ADMINISTRATION ═══ */
  ws0: [
    ["General Info", [
      {n:"What we do?", s:"done"},
      "Useful Links",
      "TimeWatch",
      "Anydesk"
    ]],

    ["Monday", [
      ["EasyBIM Procedure", [
        {n:"EasyBIM Process (Boards & Timesheets)", s:"done"}
      ]],
      ["Get Started With the Basics", [
        {n:"A short video — almost everything you can do with monday.com", s:"done"},
        {n:"Add, delete, customize and move items", s:"done"},
        {n:"Add and move columns", s:"active"},
        "Add, delete and customize a group",
        "Add customized views",
        "Invite team members",
        "Save time with batch actions",
        "Add new boards and templates",
        "Share board views with anyone"
      ]],
      ["Communication Tools", [
        "Write updates and tag teammates",
        "Setup notifications",
        "Everything you can do in the update section",
        "Tag an entire team"
      ]],
      ["All About Automations", [
        "Add automations",
        "Set automations for notifications",
        "Automate actions based on status change"
      ]],
      ["All About Integrations", [
        "Setup integrations with your favorite apps",
        "Sync with your calendar",
        "Integrate your emails"
      ]],
      ["All About Dashboards", [
        "Create a dashboard",
        "Add dashboard widgets"
      ]],
      ["Become a monday.com Master", [
        "Quick search with 'Bolt Switch'",
        "Create checklists",
        "Search or filter within a board",
        "Search across boards with \"Search everything\"",
        "Set deadlines",
        "Set due date reminders",
        "Track assignments each week",
        "You're a PRO",
        "Google Docs Templates in Monday"
      ]],
      {n:"Monday Agents — my research", custom:true, c:[
        "Agent recipes I found",
        "Test board: Automations 2025"
      ]}
    ]],

    ["Google (Workspace)", [
      "Google Drive",
      ["Gmail", [
        "Labels",
        "Filters",
        "Signature Template",
        "Top 15 Gmail Tips & Tricks"
      ]],
      "Calendar",
      ["To Do List", [
        "Gmail Contacts",
        "Gmail Labels",
        "Chrome Bookmarks"
      ]],
      "Photos",
      "Contacts",
      "Sheets",
      "Docs",
      "Slides"
    ]],

    {n:"My Study Space", custom:true, c:[
      {n:"Useful links I collected", s:"done"},
      "Questions for my mentor",
      ["Monday automations — deep dive", [
        "Examples that worked",
        "Recipe ideas to try"
      ]]
    ]}
  ],

  /* ═══ WORKSPACE 1 — BIM METHODOLOGY & TOOLS ═══ */
  ws1: [
    ["General", [
      ["Documentation", [
        {n:"BIM\\Revit Terminology", s:"done"},
        "BIM Tools Out There",
        "Construction Terms Dictionary"
      ]]
    ]],

    ["Revit", [
      ["Docs", [
/* GENERATED:START — from Monday board "Revit" > "Docs" via scripts/digestRevitDocs.ts. Do not hand-edit; rerun the script instead. */
        {n:"DXXXX - Project Startup", s:"done", doc:"1BMoEHrV0kFXtnr5M2wOupI8WsoIHXEspbvoFuMpPdhY"}, /* mondayItemId: 4957274384 */
        {n:"DXXXX - Project Startup (Local)", s:"done", doc:"1FUhz47O_u0F5pHniJ1YW3u3HqDz9VwZW1qsPzrFvnno"}, /* mondayItemId: 5114292841 */
        {n:"DXXXX - BIM360 & ACC", s:"done", doc:"1rVm3x4uIl2uo2jPV3FVPR3PrkXmvPEbKfyTejfXV60s"}, /* mondayItemId: 4957277765 */
        {n:"DXXXX - Revit Links", s:"done", doc:"14A_KM3TUVoGGVjWbEbJb1Ec1ztqpVGzk72yd5KT7uxk"}, /* mondayItemId: 4957281281 */
        {n:"DXXXX - איפה האלמנטים שלי", s:"done", doc:"1Mg9FQpCIyqnno0FUyZ6BEsM7zcTMBDQStriOCzx3VbI"}, /* mondayItemId: 4957282700 */
        {n:"DXXXX - Parameters", s:"done", doc:"1QVm5G4Sg1Fww7b90meFOcNReKgBxM07pynZiYuTs4zs"}, /* mondayItemId: 4957292777 */
        {n:"DXXXX - Sheet Creation", s:"done", doc:"1qNDLuC93j92NtyDJu8F-5KFPTOE76BkyzHxhF8Bi6Cg"}, /* mondayItemId: 4957294903 */
        {n:"DXXXX - Project Browser Organization", s:"done", doc:"1BtBMB7ffKCRvWbGDnm7iYUCJT795rd3lw4spoAHzXI8"}, /* mondayItemId: 4957296514 */
        {n:"DXXXX - Scope Box", s:"done", doc:"19mwlrlR1FqL-mnpi5znFs54eWBh_nulKfyUZ3682WG8"}, /* mondayItemId: 4957297242 */
        {n:"DXXX - TIDP", s:"done", doc:"18pdyOAl20ueqBO4vA0clJ3vwGipIdicibllrFGZhx7k"}, /* mondayItemId: 4957297433 */
        {n:"DXXXX - Schedules", s:"done", doc:"1GVthyBFkVCJ7jSKEmfSDgsMMygOoS2gD-QBlrnWEnLk"}, /* mondayItemId: 4957297812 */
        {n:"DXXXX - Export Revit to dwg"}, /* mondayItemId: 4957298891 */
        {n:"DXXXX - dwg to Revit", s:"done", doc:"1q7_bo9nevXSN7aDBTljsyN6BfYvEbLUAsXZIxPlXQhk"}, /* mondayItemId: 4957300064 */
        {n:"DXXXX - BOQ", s:"done", doc:"1HZTML5EInp_61TdVI0seR550KD1qQ8hC"}, /* mondayItemId: 4957301151 */
        {n:"DXXXX - Design Collaboration", s:"done", doc:"1PAWucbJwUzJbo58_R_KRAQDWdPKU5xgY"}, /* mondayItemId: 4957301652 */
        {n:"DXXXX - View Range", s:"done", doc:"1tT7NvgAABZq78vZgKuPGYwxMVjtr5k_xHv32I3wmNDU"}, /* mondayItemId: 4957304275 */
        {n:"DXXXX - Publish Set", s:"done", doc:"1oMVZe6mqO4rjPpjSNSAa_oryb9tOpT5b5TaZtoeERGM"}, /* mondayItemId: 4957307198 */
        {n:"DXXXX - Coordination Review", s:"done", doc:"1xxVihf_O57BchWfBJaH68CpTpN88IGBGBYWyFQPZSF4"}, /* mondayItemId: 4957309925 */
        {n:"DXXXX - Filters", s:"done", doc:"1fHQSSBz9w2CNUzU8duXdY3-h539tZCquBGm3jsQSyUk"}, /* mondayItemId: 4957310402 */
        {n:"DXXXX - Worksets", s:"done", doc:"12qLv_XUQe7y3mTkS4sQv8rNCzzP0wkFWJU8cMG0v8-U"}, /* mondayItemId: 4957311960 */
        {n:"DXXXX - Levels & Grids", s:"done", doc:"1YaKfeIHCrW65gFmDQ357pwbXEntXdK2OIvosOx8nnWE"}, /* mondayItemId: 4957312416 */
        {n:"DXXXX - View Template", s:"done", doc:"1jtbxeWPxMjrnl1ih0lRFizm8aT7erBuddhsyNCR1DoI"}, /* mondayItemId: 4957312788 */
        {n:"DXXXX - Dynamo", s:"done", doc:"1T2nYaI6sRwSl7oJcpZzrIpm7-0MbiMQZkcKv1QHYDRI"}, /* mondayItemId: 4957314083 */
        {n:"DXXXX - Kinship Plugin", s:"done", doc:"15Ca6DIhJGb66J50jUWlLSL7lF7iOnknI"}, /* mondayItemId: 4957329400 */
        {n:"DXXXX - Define ARC Background", s:"done", doc:"1Js8znCZgNUpuyt8sgAE8MsfEznZW2pf3"}, /* mondayItemId: 4957331404 */
        {n:"DXXXX - Issues", s:"done", doc:"1XiTyyv5nkhcblfnf5VrknQz5ZOW2MQRSGuUT1wkyUyk"}, /* mondayItemId: 5539757158 */
        {n:"DXXXX - Civil3D To Revit", s:"done", doc:"1rcvyy1wEMMFKgCcDP2hh6WCrJL5YD6UIxNRn4qeg92I"}, /* mondayItemId: 5838842770 */
        {n:"DXXXX - Change Family Category", s:"done", doc:"1yUyTHk2zRf__UiOso9RKjMCwqRC3oWJbdMaasVwF8N0"}, /* mondayItemId: 5838848672 */
        {n:"DXXXX - Tags", s:"done", doc:"1BsDsR9Z7IOq9J0OiBEV6RQltB_Ql6NRteaicoE2fV-w"}, /* mondayItemId: 5838826673 */
        {n:"DXXXX-Diroots Guide", s:"done", doc:"1RPLbcC9DXpJh9tMWwPHUIim6Vw9jspz37N7EXfS1Iig"}, /* mondayItemId: 5838864799 */
        {n:"DXXXX - Revit Cleanup", s:"done", doc:"1XCae8kDqUJhVn1lTTfs8t7B2dNaTCD4_CONd4UWLPT0"}, /* mondayItemId: 5838870467 */
        {n:"DXXXX - Autodesk Desktop Connector", s:"done", doc:"1QHO9sh75T9bkerA7VPxBWR5IZvyJYr5c2fog6wLzHI0"}, /* mondayItemId: 6536605509 */
        {n:"DXXXX - Create Worksets With pyRevit", s:"done", doc:"1YniUUI2QSs_wc22g-Vm3pwfaTFdy9l9yM_E9-MatKXk"}, /* mondayItemId: 6536624605 */
        {n:"DXXXX - Hide Elements", s:"done", doc:"1X4bcZwhNizK6Fao3ZFRK4YB2kS27KDfndJZrC094Daw"}, /* mondayItemId: 6536638490 */
        {n:"DXXXX - Import Title Block", s:"done", doc:"1_qFT1DZdYfgSNlR9OFEgTCkhvXsWCy_kmc8GZ4A_M0c"}, /* mondayItemId: 6536638967 */
        {n:"DXXXX - Rooms Spaces & Zones", s:"done", doc:"1cS2qm41RQoED2nJ-psBT5DqeJGUm23FTjgjycVqLQzE"}, /* mondayItemId: 6536647726 */
        {n:"DXXXX - Repetetive Modeling", s:"done", doc:"1WS9d4Rewy63r71tt0zTfTzhZ11V6qgf7UFRfYGEUtPM"}, /* mondayItemId: 6671183017 */
        {n:"DXXXX - EasyBIM Plugin", s:"done", doc:"1Ga4-ZpLzdNIpMLI20I7SfL9qs696rIiwFQfnRWQq7zc"}, /* mondayItemId: 6801946933 */
        {n:"DXXXX - Relocating Linked Models", s:"done", doc:"1CZ3BiC6TB065kPZl4oOvjAVQ-3OrI9t6eqwJbhfD9Zk"}, /* mondayItemId: 7051979794 */
        {n:"DXXXX - Dependent Views", s:"done", doc:"1dBHfSt9Za-sKANMoVL48z0f_tCTER_mINsElrFDWRGQ"}, /* mondayItemId: 7086822191 */
        {n:"DXXXX - Inherit a Project", s:"done", doc:"1q8VKWyoEKOoiAdGiMYA8DQDhMhx4yrOr7-bXgcPHEyU"}, /* mondayItemId: 7312626856 */
        {n:"DXXXX - Revisions", s:"done", doc:"1fctf2bjufLXdfl8g3qiaHUYUfD5obIa9pN2Q0xsSRJg"}, /* mondayItemId: 7445436132 */
        {n:"DXXXX - STEP To Revit", s:"done", doc:"1SOemOLDSbm8kr8ArSgQyacQu_a26xNy24G497BxWqyw"}, /* mondayItemId: 7608694351 */
        {n:"DXXXX - BIM Standard", s:"done", doc:"1WC6n4X5kAPbLp37sRZj78gTQhBtaeISzp5PZ2dp8qFA"}, /* mondayItemId: 7313812428 */
        {n:"DXXXX - Welcome to the Office", s:"done", doc:"1PhmXqS4CReIN3VbQBu_ep-pfYIqEjikGTq6debe1JwI"}, /* mondayItemId: 8359922631 */
        {n:"DXXXX - Design Options", s:"done", doc:"1a_NyAqsZUMyVZVk8-uqciH2j25IQqQUSlwlTlh9ExYY"}, /* mondayItemId: 8405553998 */
        {n:"DXXXX - PyRevit", s:"done", doc:"1WfFa6iny_ZoJyKrj7cQ6rK6EMvxj_WnDOlCfrD-PdVM"}, /* mondayItemId: 9940051140 */
        /* GENERATED:END */
      ]],
      ["Videos", [
/* GENERATED:START — from Monday board "Revit" > "Videos" via scripts/digestRevitVideos.ts. Do not hand-edit; rerun the script instead. */
        {n:"VXXXX - Lesson 1", s:"done", video:"1KC8yPf9Y2WogteLpu0_PyH1rQmNhct0O", descEn:"General BIM Concepts, Revit Interface", descHe:"מושגים כלליים בעולם ה- BIM, וממשק תוכנת ה-Revit"}, /* mondayItemId: 4956959681 */
        {n:"VXXXX - Annotations", s:"done", video:"1KGH6uOpLi9xB3gKMkgPnHrnuPHewpHas", descEn:"Create and manage annotations & Tags", descHe:"יצירת אנוטציות/תגיות, עריכה וניהול של המידע שבהם"}, /* mondayItemId: 4957222495 */
        {n:"VXXXX - Project Startup", s:"done", video:"1KDIY_XavU4sudXt78zRbtAdUtFErrmDU", descEn:"Project startup: Collaborate In Cloud, Revit Links, Acquire Coordinates, Copy Monitor, Worksets & Views", descHe:"פתיחת פרויקט חדש - פעולות ראשוניות: Link ARC Model, Acquire Coordinates, Copy Monitor"}, /* mondayItemId: 4956959910 */
        {n:"VXXXX - Create Views+Dynamo", s:"done", video:"1KEXC7bKAb-sDw8sUxr78r73_xuVRceNM", descEn:"Create new views manually & automatically by Dynamo", descHe:"יצירת מבטים בצורה ידנית ואוטומטית ע\"י Dynamo"}, /* mondayItemId: 4956960469 */
        {n:"VXXXX - ScopeBox", s:"done", video:"1KDooXZ68xDH-7F9LIzzG0-6m4io3Tvn9", descEn:"What is a Scope Box and how to copy from the \nArchitectual model", descHe:"מהו Scope Box וכיצד להעתיק אותו ממודל האדריכלות"}, /* mondayItemId: 4956970051 */
        {n:"VXXXX - Worksets", s:"done", video:"1KEnnu5shcr30wsNgxrpE_8b_3r_7cUgl", descEn:"Working with worksets, open manually & automatically with Dynamo", descHe:"עבודה עם Worksets בצורה ידנית ואוטומטית בעזרת Dynamo"}, /* mondayItemId: 4957219195 */
        {n:"VXXXX - BIM360", s:"done", video:"1KF9zlZF1Klb1IvROYVIGxNj7UCABHZXz", descEn:"BIM360 logic and work methods", descHe:"מהו BIM360 וכיצד לעבוד בממשק זה"}, /* mondayItemId: 4957220015 */
        {n:"VXXXX - Cable Trays", s:"done", video:"1K9wUge0D366Ede_Q6mVHYY-qoR_hI9Wo", descEn:"Cable trays modelling techniques", descHe:"שיטות למידול תעלות חשמל"}, /* mondayItemId: 4957221247 */
        {n:"VXXXX - Electrical Equipment", s:"done", video:"1KA9_dMje9blX79fZZ7WQIc8KijsPrflw", descEn:"Electrical Equipment modelling techniques, general Family structure, Type/Instance parameters", descHe:"שיטות למידול ציוד חשמל, מבנה משפחות ופרמטרים מסוג Type/Instance"}, /* mondayItemId: 4957222096 */
        {n:"VXXXX - View Template", s:"done", video:"1KFXNQXvQzaRm7_gicpPWgMf1Oiffjp1W", descEn:"Whats are View Templates, how to create & manage", descHe:"מהם View Templates, כיצד ליצור ולנהל אותם"}, /* mondayItemId: 4957223745 */
        {n:"VXXXX - Dynamo Create Sheets", s:"done", video:"1KH-M3GWOSn6x-Rq_kzQs66pxYFk_xOrh", descEn:"Create sheets & place views on sheets with Dynamo", descHe:"יצירת גליונות ומיקום מבטים על גבי הגליונות בעזרת Dynamo"}, /* mondayItemId: 4957224754 */
        {n:"VXXXX - Print Options", s:"done", video:"1KHgtg0gukpOoqVV3Nfj9lGhAsNJBu-jZ", descEn:"General print options: Sheets, Title Block family, & Revisions", descHe:"הגדרות הדפסה כלליות: גליונות, סטריפ ומהדורות"}, /* mondayItemId: 4957225958 */
        {n:"VXXXX - Create Views for Lighting Fixtures", s:"done", video:"1KL5HdGL-pjx1t2RlPnBNPA4-oD0pbYtS", descEn:"Two views concept (Floor & Ceiling)", descHe:"שיטת 2 המבטים (רצפה ותקרה)"}, /* mondayItemId: 4957226853 */
        {n:"VXXXX - Lighting Fixtures", s:"done", video:"1KB4_Ko5u-mfYqk_UIiaUtXaObKcsWxt-", descEn:"Model and manage Lighting Fixtures", descHe:"שיטות למידול וניהול גופי תאורה"}, /* mondayItemId: 4957229574 */
        {n:"VXXXX - Dynamo Lighting Fixtures", s:"done", video:"1K8uNexMhBTHir8l-KtOqqlOXJCptxV3w", descEn:"Model Lighting Fixtures with Dynamo", descHe:"מידול גופי תאורה בעזרת Dynamo"}, /* mondayItemId: 4957228981 */
        {n:"VXXXX - Lighting Devices", s:"done", video:"1KBy9-y2TDyx5cgiy5qrKJr73ap1zn_JM", descEn:"Model and manage Lighting Devices", descHe:"שיטות למידול וניהול מכשירי תאורה"}, /* mondayItemId: 4957231661 */
        {n:"VXXXX - Parameters", s:"done", video:"1KKNC8vLwVbtV_RSKPI5NsDsv5hgK6vu7", descEn:"General concepts of Global Parameters, Project Parameters & Shared Parameters", descHe:"הסבר ומושגים כלליים בנושא Global Parameters, Project Parameters & Shared Parameters"}, /* mondayItemId: 4957232196 */
        {n:"VXXXX - Families", s:"done", video:"1KKyMug4-_dWTAtsZ26uSfKYH5hZKF8-g", descEn:"Create and manage basic families", descHe:"כיצד ליצור ולנהל משפחות בסיסיות"}, /* mondayItemId: 4957233604 */
        {n:"VXXXX - Fix Flying Elements", s:"done", video:"1K9gfyCh1ElxZJ-LqD-Flt1KqPX6u_pN0", descEn:"Fix Flying Elements with Dynamo", descHe:"תיקון מיקום \"אלמנטים מרחפים\" בעזרת Dynamo"}, /* mondayItemId: 4957349151 */
        {n:"VXXXX - Create Sheets With Diroots", s:"done", video:"1oaRa6dUDmubenEkbJjmGEkQaea_5-TRK", descEn:"How to Create Sheets With Diroots Based On A TIDP (Task Information Delivery Plan)", descHe:"יצירת גליונות על בסיס רשימת TIDP (רשימת גליונות/תוצרים) בעזרת Diroots"}, /* mondayItemId: 4957358083 */
        {n:"VXXXX - Fix Worksets With Diroots", s:"done", video:"1KRIzbKWRT3_zlxH3x_rRDSWDzJWolGu_", descEn:"How to Create & Fix Worksets With Diroots", descHe:"יצירה ותיקון Worksets בעזרת Diroots"}, /* mondayItemId: 4957359503 */
        {n:"VXXXX - Reset Coordinates", s:"done", video:"1KLan_6UqLMWA4YjAzZDTMtaAVepY7aKV", descEn:"How to Reset Coordinates", descHe:"איך לאתחל מיקום קורדינאטות במודל"}, /* mondayItemId: 4957360699 */
        {n:"VXXXX - Selection Box", s:"done", video:"1KLoUgVqgjIjUr3fuoZf09b520cllF4lF", descEn:"What is a Selection Box & how to create it", descHe:"מהו Selection Box וכיצד ליצור אותו"}, /* mondayItemId: 4957362705 */
        {n:"VXXXX - Your File Is Not Compatible", s:"done", video:"1KO9V1Kz1ItmeYlJfDyu6yjurC2bg2hKx", descEn:"How to fix \"Your File Is Not Compatible...\" Error", descHe:"פתרון לתקלת ה - Your File Is Not Compatible"}, /* mondayItemId: 4957363503 */
        {n:"VXXXX - How To Calculate Areas", s:"done", video:"1KO0TdiKKFtF_ZSHlthePp_22palwwocW", descEn:"Different methods for Calculating Areas", descHe:"כיצד לחשב שטחים בשיטות שונות"}, /* mondayItemId: 4957364295 */
        {n:"VXXXX - EasyBIM Plugin - dwg to Revit_Sprinklers", s:"done", video:"1bRmoNb0RnEEvBkrVyNYS3HXl6nXeJo9q", descEn:"Create Sprinklers in Revit Based on a dwg file (Via EasyBIM Plugin)", descHe:"יצירת ספרינקלרים על בסיס קובץ dwg בעזרת פלאגין EasyBIM"}, /* mondayItemId: 6855723596 */
        {n:"VXXXX - EasyBIM Plugin - Dimensions", s:"done", video:"1bWndTWChxhbVO-ZIjc7i3s_4fBVXy3tx", descEn:"Automatically dimension MEP elements (Via EasyBIM Plugin)", descHe:"מתן מידות אוטומטיות לאביזרי חשמל, אינסטלציה ומיזוג אויר בעזרת פלאגין EasyBIM"}, /* mondayItemId: 6855742411 */
        {n:"VXXXX - EasyBIM Plugin - dwg to Revit_Lighting Fixtures.mp4", s:"done", video:"1636m5gOJhoCNiAOjZ98JuoWrxqIsqsHM", descEn:"Create Lightng Fixtures in Revit Based on a dwg file (Via EasyBIM Plugin)", descHe:"יצירת גופי תאורה על בסיס קובץ dwg בעזרת פלאגין EasyBIM"}, /* mondayItemId: 6964603476 */
        {n:"VXXXX - Create legends with Diroots", s:"done", video:"17S2fwjLkdEA8iggMjM0aT96bAYpWeXtZ", descEn:"How to create legends automatically with Diroots", descHe:"כיצד להכין מקראים אוטומטית עם Diroots"}, /* mondayItemId: 7626850824 */
        /* GENERATED:END */
      ]],
      ["MEP", [
        "DXXXX - Plumbing Design",
        "DXXXX - Details of water camel accessories",
        "DXXXX - Laboratory supplies",
        "DXXXX - Grounding",
        "Copy Monitor for MEP Fixtures"
      ]],
      ["Families", [
        "Part 1 - Planning a Revit Family",
        "Part 2 - Revit Family Geometry & Constraints",
        "Part 3 - Revit Family Parameters",
        "Part 4 - Revit Family Graphics",
        "Parametric Arrays in Revit Families",
        "Parametric Family with angles and arrays",
        "Using Revit Lookup Tables!",
        "Angular Constraints in Revit Families",
        "Revit Element Visibility Override Hierarchy Pyramid",
        "Windows Families"
      ]],
      ["Dynamo", [
        "Change Families Categories in a Batch",
        "Delete Unused Filters"
      ]],
      ["Reference", [
        "Acquire Coordinates - Multiple Shared Site (Method 1)",
        "Acquire Coordinates - Multiple Shared Site (Method 2)",
        "Coordinates System"
      ]]
    ]],

    ["Infrastructure", [
      ["General", [
        "Example Exodigo M3021 CIVIL3D",
        "IFC 4.3 - Important update for Infrastructure elements",
        "MEP coordination using Navisworks",
        "Manhole Detail"
      ]],
      ["NTI", [
        "NTI Standard catalogues",
        "NTI BEP Template",
        "NTI BIM Standard",
        "NTI Disciplines",
        "NTI Drainage Cataloge",
        "NTI Highways Cataloge",
        "NTI Phases acronyms",
        "NTI Guideline for Civi3D modelling",
        "NTI Catalog installation",
        "NTI CAD Standard"
      ]],
      ["AHW", [
        "תעריף בימ נת\"א"
      ]],
      ["Collaboration", [
        "Streamline exchange of data between Civil 3D, Revit and Infraworks",
        "A Walk in the Park: Using BIM 360, Civil 3D, and InfraWorks in a Collaborative Project",
        "Civil Design and a Living InfraWorks Model",
        "Linking Civil3D Surface to Revit models",
        "Civil 3D and Autocad collaboration"
      ]],
      ["Infraworks", [
        "מדריך - הקמת מודל Infraworks ראשוני",
        "Importing DWG files as 2D overlay",
        "Importing Revit models",
        "Importing 3D objects from Civil3D without a surface",
        "Importing Civil3D 3D model (only geometry, no data)",
        "Importing Trees",
        "Course: Infraworks on LinkedIn",
        "Making Something from Nothing: New Ways of Using InfraWorks for Your Design",
        "Setting up an Infraworks model",
        "Style Rules",
        "Introduction to Data Sources",
        "Proposals",
        "Modelling Utilities",
        "Syncing Idan and Infraworks",
        "Export IFC from Revit and import into WX",
        "Storyboard export settings",
        "Infraworks Sync",
        "Speedup Infraworks Performance",
        "Implement Style Rules and Style Palette in Infraworks"
      ]],
      ["Civil3D", [
        "TeamCAD Guide for Civil3D",
        "Setting Coordinates",
        "COGO points",
        "Converting Autocad Block References to COGO Points",
        "Surface creation",
        "Surface - creation from Dis & Reg files",
        "Surface - breaklines",
        "Quick Cross Section command",
        "Data Shortcuts",
        "Upload to ACC",
        "Civil3D Extensions",
        "Adding new pipe sizes",
        "Coloring surface by elevation with a legend",
        "Corridor basics",
        "Project Explorer Tutorial",
        "Share Settings and Styles between Civil3D models",
        "Transferring styles between models",
        "Toolspace Symbols and meanings",
        "WIP / Shared Data Shortcuts Workflow",
        "Pipe rules",
        "XREF Civil3D into AutoCAD",
        "Export NWC"
      ]],
      ["Revit for Infrastructure", [
        "Acquire Coordinates (from URS/DWG)"
      ]],
      ["IFC", [
        "Recommended IFC viewer - BIM Vision"
      ]],
      ["GIS", [
        "GIS for Civil Design (AU)"
      ]],
      ["Rails", [
        "From InfraWorks to AutoCAD Civil 3D for Rail Projects"
      ]]
    ]],

    ["ACC", [
      ["Viewing Models Online", [
        "Publish settings",
        "Processing error"
      ]],
      ["Project Setup", [
        "HUB Setup",
        "ACC - Open New Project",
        "Design Collaboration (including Automatic Publish)",
        "Adding a project picture",
        "Folders' automations"
      ]],
      ["Docs", [
        "ACC file versions",
        "Renaming models on ACC",
        "Naming Standard",
        "Unlocking DWG files",
        "DWG Hebrew display"
      ]],
      ["Issues", [
        "Create new Issue Templates",
        "Create Issue & Markups",
        "Add custom fields to ACC issues (e.g. discipline)",
        "Issue Permissions",
        "Send Report (BIM 360)",
        "Send Report (ACC)"
      ]],
      ["General", [
        "Autodesk Desktop Connector",
        "BIM360 Vs ACC",
        "Email Notifications",
        "Subscriptions overview",
        "ACC Members status",
        "Restore Revit cloud models old versions",
        "Publish limitations within ACC",
        "Integrations",
        "Files notifications (subscribing to folders)",
        "Working with AutoCAD in ACC",
        "Typical modelling - Groups or Links?",
        "Folders permissions",
        "Moving files from BIM360 to ACC with ART",
        "Bridge"
      ]],
      ["Model Coordination", [
        "ACC model coordination",
        "Elements' ID"
      ]]
    ]],

    ["LEAN", [
      ["Agile", [
        "Agile Lean White Belt",
        "Agile Lean - Yellow Belt",
        "8 Wastes Example",
        "Control Panel Example",
        "Maximize Value with Lean",
        "Lean BIM Workflows",
        "LEAN Docs",
        "Value Stream",
        "4P Model"
      ]]
    ]],

    ["Navisworks", [
      ["General", [
        {n:"Model coordination (chapter 2.2 WIP)", s:"active"}
      ]]
    ]]
  ],

  /* ═══ WORKSPACE 2 — EASYBIM TEAMS ═══ */
  ws2: [
    ["Interior BIM M.", [
      ["General", [
        {n:"Clients Employees Matrix", s:"done"},
        "Passwords",
        "Bookmars Bar",
        "Contacts",
        "Revit Licenses types",
        "BIM & Revit Terminology",
        "DXXXX - Welcome To Interior BIM M.",
        "LOD/LOG/LOI"
      ]],
      ["Templates", [
        "Training Doc Template",
        "Training Doc Template (English)",
        "Monthly Report Template",
        "Davinci Template",
        "Strategic Plan Template",
        "Annual/Half Year Report Template",
        "TIDP Template",
        "Interior BIM M_QA Template",
        "BIM Management Template"
      ]],
      ["Tips & Tricks", [
        "Revit Template Cheat Sheet"
      ]]
    ]],

    ["BIM Mgmt & SP", [
      ["Coordinates", [
        {n:"Changing Location in Shared Coordinates", s:"done"},
        "Locating multiple buildings in Shared Coordinates",
        {n:"Acquiring coordinates from multiple models", s:"active"},
        "Rotate Project North",
        "Moving Project Base Point",
        "Moving Survey Point",
        "Copying Multiple Shared Sites From ARC"
      ]],
      ["Autocad", [
        "Absolute & Relative paths",
        "דנשים לעבודה משותפת בענן באוטוקאד",
        "Colors on AutoCAD & PDFs (Plot styles)"
      ]],
      ["Revit", [
        "Project browser and Views organization",
        "Parametric Title Block",
        "Adding tags to 3D view",
        "Annotations in Revit",
        "Construction Phases",
        "View range",
        "Link CAD settings",
        "Project parameters",
        "Parameters in Revit",
        "Model structure strategy",
        "Copy / Monitor",
        "Revit Revisions",
        "Phase Filters",
        "View settings hierarchy",
        "Modelling openings"
      ]],
      ["Revit Troubleshoot", [
        "Can't acquire coordinates"
      ]],
      ["Revizto", [
        "RED Academy"
      ]],
      ["Civil3D Workflows", [
        "Drainage modelling"
      ]],
      ["General", [
        "Model access for non-revit users",
        "Simplex model implementation requirements",
        "Tel Aviv Municipality Guideline"
      ]],
      {n:"Model QA", muted:true},
      ["Superposition", [
        "Clash Detection - Revizto",
        "Head Clearance"
      ]],
      ["Workflows BIM Management", [
        "How to create a BEP",
        "Model QA",
        "Duplicate structural levels - Why is it a bad idea"
      ]],
      ["MEP", [
        "מערכות אינסטלציה",
        "פירוט אביזרי גמל",
        "Plumbing - Floor Traps/Floor Box",
        "מעבדות",
        "מצנת מערכות אינסטלציה",
        "Mirror sensitive systems",
        "מפרט למערכת מיזוג אוויר - פרויקט בן גוריון אשדוד",
        "מצנת מערכות מיזוג אוויר",
        "Smoke & Fire Dumpers"
      ]],
      ["EB_BIM Coordination Docs-Templates", [
        "CD000-BIM Coordination docs",
        "CD0001-WWH - When, What, and How For the BIM Coordinator",
        "CD0002 - MEP Concepts For the BIM Coordinator",
        "CD0003-CEP-Coordination Execution Plan"
      ]],
      ["EB_BIM.M Docs-Templates", [
        "BEP Template - BIM Execution Plan",
        "BEP Appendix 1 - Naming Convention",
        "BEP Appendix 2 - MPDT",
        "Training Template"
      ]],
      ["4D + 5D", [
        "4D Navisworks",
        "4D Navisworks 2"
      ]]
    ]],

    ["Role Descriptions", [
      "MEP Coordinator — מתאם מערכות",
      "BIM Coordinator — מתאם בים",
      "BIM Manager — מנהל מודל"
    ]],

    ["WWH-General · Work With How", [
      {n:"200_Set Project On Monday", s:"done"},
      "201_Create google drive folder",
      "202_Open project on ACC",
      "203_Set Automatic Publish on ACC",
      "204_Google Contacts Access",
      ["WWH-BIM Man.", [
        "100_Introduction meeting with ARC/MGMT",
        "101_Create a BEP",
        "102_BIM Training - Agenda",
        "103_Create Revit combined model",
        "104_Create AR/ST Floor Plan (FP)",
        "105_Modify AR/ST FP View Template",
        "106_Modify AR/ST FP Floor Plans (FP)",
        "107_Create AR/ST Sections & assign Views",
        "108_Set AR/ST Sheet",
        "109_Create AR/ST Issues",
        "110_Export Sheets from ACC & Send Email",
        "113.P_QA Model - Revit Coordinate Verification",
        "114_Syncing Coordinates for an Existing Project",
        "115. Meeting with ARC",
        "116. Shared Contacts Management",
        "117. Conduct QA Model",
        "118. Open Issues in ACC",
        "119. Prepare QA Report",
        "120. QA Model - Send email",
        "121. P_QA Model - Model In Cloud",
        "122. P_QA Model - Model Naming",
        "123. P_QA Model - ACC Subscription",
        "124. P_QA Model - Project Base Point / Survey point",
        "125. P_QA Model - Clean Views",
        "126. P_QA Model - Publish Set",
        "127. P_QA Model - Workset List",
        "128. P_QA Model - Assign links to Worksets",
        "129. P_QA Model - Import other disciplines",
        "130. P_QA Model - Copy Monitor Levels/Grids",
        "131. P_QA Model - Duplicate/Missing Levels",
        "132. P_QA Model - Title Block",
        "133. P_QA Model - Grids Coordination Review",
        "134. Issues templates",
        "135. Publish views report",
        "136_Levels Coordination",
        "137_AR/ST Model Maturity",
        "138_Schedule BIM Training",
        "139_Project Base Point Dynamo check",
        "140_ARC/STR View Template Automation",
        "141_Create URS model"
      ]]
    ]],

    ["WWH-CD · Construction Documents", [
      {n:"CD Training", c:[]},
      ["CD Workflow Procedures", [
        "001_Produce CEP",
        "002_Learn the project",
        "003_CD Weekly Meetings",
        "004_Create Floor Plan (FP)",
        "005_Set FP View Template",
        "006_Set FP Link Setting",
        "007_Create Ceiling Plan",
        "008_Set CP View Template",
        "009_Set CP Link Setting",
        "010_Create and set Sections",
        "011_Set Section View Template",
        "012_Create Sheet",
        "013_Place all views on sheet",
        "014_Set Titleblock",
        "015_Publish Sheets",
        "016_Create Coordination Issues",
        "017_Export sheets from ACC",
        "018_Export Issues Report",
        "019_Checklist before sending deliverables",
        "020_Send email",
        "021_Upload Deliverables",
        "022_Monthly Status to project management",
        "023_Automatic Navis Clash checks",
        "024_Create OP Ceiling view",
        "025_Create OP Floor plan",
        "026_Create OP Sheet",
        "027_Model Openings",
        "028_Create OP Issues",
        "029_NavisConfig-3D Views in Revit",
        "030_Model Head height Mass",
        "031_ModelCoordination Space",
        "032_Set model in Navis before coordination",
        "033_Clash Detection Guidelines - Parking"
      ]]
    ]]
  ]
};
