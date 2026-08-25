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
        {n:"DXXXX - Project Startup", s:"done", doc:"project-startup"},
        {n:"DXXXX - Project Startup (Local)", s:"done"},
        {n:"DXXXX - BIM360 & ACC", s:"active"},
        "DXXXX - Revit Links",
        "DXXXX - איפה האלמנטים שלי (Common Visibility Issues & Troubleshooting)",
        "DXXXX - Parameters",
        "DXXXX - Sheet Creation",
        "DXXXX - Project Browser Organization",
        "DXXXX - Scope Box",
        "DXXX - TIDP",
        "DXXXX - Schedules",
        "DXXXX - Export Revit to dwg",
        "DXXXX - dwg to Revit",
        "DXXXX - BOQ",
        "DXXXX - Design Collaboration",
        "DXXXX - View Range",
        "DXXXX - Publish Set",
        "DXXXX - Coordination Review",
        "DXXXX - Filters",
        "DXXXX - Worksets",
        "DXXXX - Levels & Grids",
        "DXXXX - View Template",
        "DXXXX - Dynamo",
        "DXXXX - Kinship Plugin",
        "DXXXX - Define ARC Background",
        "DXXXX - Issues",
        "DXXXX - Civil3D To Revit",
        "DXXXX - Change Family Category",
        "DXXXX - Tags",
        "DXXXX - Diroots Guide",
        "DXXXX - Revit Cleanup",
        "DXXXX - Autodesk Desktop Connector",
        "DXXXX - Create Worksets With pyRevit",
        "DXXXX - Hide Elements",
        "DXXXX - Import Title Block",
        "DXXXX - Rooms Spaces & Zones",
        "DXXXX - Repetetive Modeling",
        "DXXXX - EasyBIM Plugin",
        "DXXXX - Relocating Linked Models",
        "DXXXX - Dependent Views",
        "DXXXX - Inherit a Project",
        "DXXXX - Revisions",
        "DXXXX - STEP To Revit",
        "DXXXX - BIM Standard",
        "DXXXX - Upload Plant3D ACC",
        "DXXXX - Welcome to the Office",
        "DXXXX - Design Options",
        "DXXXX - PyRevit"
      ]],
      ["Videos", [
        {n:"VXXXX - Lesson 1", s:"done"},
        "VXXXX - Annotations",
        "VXXXX - Project Startup",
        "VXXXX - Create Views + Dynamo",
        "VXXXX - ScopeBox",
        "VXXXX - Worksets",
        "VXXXX - BIM360",
        "VXXXX - Cable Trays",
        "VXXXX - Electrical Equipment",
        "VXXXX - View Template",
        "VXXXX - Dynamo Create Sheets",
        "VXXXX - Print Options",
        "VXXXX - Create Views for Lighting Fixtures",
        "VXXXX - Lighting Fixtures",
        "VXXXX - Dynamo Lighting Fixtures",
        "VXXXX - Lighting Devices",
        "VXXXX - Parameters",
        "VXXXX - Families",
        "VXXXX - Fix Flying Elements",
        "VXXXX - Create Sheets With Diroots",
        "VXXXX - Fix Worksets With Diroots",
        "VXXXX - Reset Coordinates",
        "VXXXX - Selection Box",
        "VXXXX - Your File Is Not Compatible",
        "VXXXX - How To Calculate Areas",
        "VXXXX - EasyBIM Plugin · dwg to Revit_Sprinklers",
        "VXXXX - EasyBIM Plugin · Dimensions",
        "VXXXX - EasyBIM Plugin · dwg to Revit_Lighting Fixtures",
        "VXXXX - Create Legends with Diroots"
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
