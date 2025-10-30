 * THIS PACKAGE HAS TWO USEFUL TOOLS 
 
============================================================================
# 1 -  CSV Tools
Project Spreadsheet Generator, Mapping all contents in the /Source folder
============================================================================

============================================================================
# 2 -  HTML Tools
Project Wiki Page .html Generator, making a web page of everything in /Source.
============================================================================

 * Developed by Variations9@Github, Production Artist.
 
Development, variations, (deviations), and vibe-coding with the help of a.i., including Claude Code and GPT Codex was at play. This submission has been carefully curated and crafted into submission, whereupon the program works beautifully.  There are many adventures throughout thid development processes that are worth in-depth future discussion.

These Folders are a result of care and consideration. If you're reading this and can understand code somewhat, these containing files might make some sense. Regardless, the tools themselves shall have the promise to be quite useful.

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