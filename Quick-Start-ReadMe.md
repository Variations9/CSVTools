# CSV Tools
Master Project Spreadsheet Generator

============================================================================
Master Spreadsheet Generator - Create a Spreadsheet of your entire project.
Developed by E. Harrison, Production & Technical Artist in Studio @ Port Townsend, 
( Bloviations and vibe-coding from a.i. Claude code & ChatGPT Codex. )
============================================================================

Adventures in Coding :  Recently, I had this vague notion in mind that when 
developing programs, what I really ought to do is to automate a spreadsheet 
generator tool, such that a spreadsheet will track all folders and script files in my
project.  Columns for each script file gets populated with entries for such as listing functions, inputs/outputs, associated dependencies and more. I'd be able to use this csv file as a map and tracking tool for additional reference and discovery.

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

node Source/Tools/CSVTools/update-csv-workflow.mjs
(the update-csv-workflow.mjs is the master orchestrator script.)

If you want to run the command to produce the full result in a workflow log, use this command:

node Source/Tools/CSVTools/update-csv-workflow.mjs 2>&1 | tee Source/Tools/logs/workflow-$(date +%Y%m%d-%H%M%S).log

After Generating the new .csv, you can rename it, and replace it with this existing
/Source/ProjectMap/SourceFolder.csv.

( This file is my current example .csv spreadsheet for a masterful estimator tool project I've been working on lately, examples upon request.) 

View Spreadsheets by importing the .csv into Google Sheets.
Additional questions?  call / email me!
E.H.