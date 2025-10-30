# CSV Tools
Master Project Spreadsheet Generator

============================================================================

 * THIS PACKAGE - a versatile spreadsheet tool generator and a html exporter wiki page generator tool.

 * Developed by Variations9@Github, Production Artist.
 
Development, Variations, Deviations, and Vibe-coding with the help of a.i., including Claude Code and GPT Codex was at play. This submission has been carefully curated and crafted into submission, whereupon the Program works beautifully.  Using a modular object-based architecture, one can develop and build upon these tools with an ease of expandability.  During these early and present days of using machine learning to generate code, the 'large language models' do a fairly decent if not amazing go at it. But I must confess that it had surmounted a massively complex challenge, in that there were multiple hurdles to overcome, that of carefully crafting and curating it all together into a modular system increment by increment.  Overcoming them became the coding adventurers journey, a deep dive into a labyrinthian complex into additional rabbit holes of complexity.  Fortunately, patterns emerged and  most of the intricacies were eventually mapped out.  When discovered initially, and through multiple iterations of developing updated versions, the continuum can at least sustain this fun and interesting journey along the way, now that (hopefully) the effectiveness will really gain momentum, There are many adventures throughout these ongoing processes that are worth in-depth future discussion. These Folders are a result of care and consideration. If you're a professional or a hobby computer science practitioner, You're probably quite better skilled at all this, than I am.  Perhaps you're seeing some glaringly obvious fact that I'm overlooking?  
Hopefully, rather, This tool is sound, and shall serve you well. 
These files and folders are (mostly) organized, well-synchronized, safe and assuredly performative. They're all here now, and they're synchronized together perfectly, reliably, and operationally.  This PARTICULAR File, is the readme file, I'll keep updated with more mentions in an upcoming release. 

============================================================================

Adventures in Coding :  Recently, I had this vague notion in mind that when 
developing programs, what I really ought to do is to automate a spreadsheet 
generator tool, such that a spreadsheet will track all folders and script files in my
project.  Columns for each script file gets populated with entries for such as listing functions, inputs/outputs, associated dependencies and more. I'd be able to use this csv file as a map and tracking tool for additional reference and discovery, and possibly use it
as a source of reference to help train LLMs.

This is a result of a fervent effort to accomplish just that;  to create a master
spreadsheet containing multiple columns that get populated with key data, listing files and folders, their containing functions, dependencies, tracking, and
so forth. 

The Spreadsheet of this project, is viewable at:
https://docs.google.com/spreadsheets/d/1Q9vF2L3K6D2Ptg94kgfpupGikGkF27CcwyihWiLbhH8/edit?usp=sharing


Another larger Example Spreadsheet is viewable at:
https://docs.google.com/spreadsheets/d/1Kwc429QBrfUCZzyB1BlzLp7wd16pyS14G42Fn7DgMm0/edit?usp=sharing


Uses Node.js - (ensure that node.js is installed.)

Supported File types: tracks all files / folders, and populates key columns with data from: .js, .json, .html, .cs, .py, .css, and .mjs file types.

Instructions for use:
Place entire project folder within this /Source folder.
Open a Terminal, and type in the command:

npm install

and then, 

node Source/Tools/CSVTools/update-csv-workflow.mjs

(the update-csv-workflow.mjs is the master orchestrator script.)
If you want to run the command to produce the full result in a workflow log, use this command:

node Source/Tools/CSVTools/update-csv-workflow.mjs 2>&1 | tee Documentation/logs/workflow-$(date +%Y%m%d-%H%M%S).log

After Generating the new .csv, you can rename it, and replace it with this existing
/Source/ProjectMap/SourceFolder.csv.

( This file is my current example .csv spreadsheet for a masterful estimator tool project I've been working on lately, examples upon request.) 

View Spreadsheets by importing the .csv into Google Sheets.
Additional questions?  call / email me!