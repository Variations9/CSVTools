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

Disclaimer:
Development, variations, (deviations), and vibe-coding with some help of a.i., including Claude Code and GPT Codex at play. This submission has been carefully curated and crafted into submission, whereupon the program works beautifully.  There are many adventures throughout this development processes that are worth in-depth future discussions, however For now, these folders are a result of care and consideration. The tools within shall have the promise to be quite useful.

These files and folders are (mostly) organized, well-synchronized, safe and assuredly performative. They're synchronized together perfectly, reliably, and operationally.  This PARTICULAR File, is the readme file, I'll keep updated with more mentions in an upcoming release. 

What is included is a set of tool packages in here that, when combined with the function
of node.js, and when running terminal commands in the project, will generate
a spreadsheet .csv file of however massive your project is, with factoids and data
statistics about the scripts contained within, populated into separate columns. Use a running spreadsheet to keep a consistent chart & roadmap to provide a companion snapshot of your entire project.

Or, maybe you want to export your project into a readable code-viewer wiki page?
It's here for your use!
============================================================================

Adventures in Coding :  Recently, I had this vague notion in mind that when 
developing programs, what I really ought to do is to automate a spreadsheet 
generator tool, such that a spreadsheet will track all folders and script files in my
project.  Columns for each script file gets populated with entries for such as listing functions, inputs/outputs, associated dependencies and more. I'd be able to use this csv file as a map and tracking tool for additional reference and discovery, and possibly use it as a source of reference to help train LLMs.

This is a result of a fervent effort to accomplish just that;  to create a master
spreadsheet containing multiple columns that get populated with key data, listing files and folders, their containing functions, dependencies, tracking, and
so forth. 

An example Spreadsheet of this project, is viewable at:
https://docs.google.com/spreadsheets/d/1Q9vF2L3K6D2Ptg94kgfpupGikGkF27CcwyihWiLbhH8/edit?usp=sharing

The point here being, the exportable .csvs are easily imported into Google Sheets.
Look at the above example for reference.

Another larger Example Spreadsheet is viewable at:
https://docs.google.com/spreadsheets/d/1Kwc429QBrfUCZzyB1BlzLp7wd16pyS14G42Fn7DgMm0/edit?usp=sharing

This google-sheet is annother one of my current examples, a .csv spreadsheet for a separate estimator tool project I've been working on lately.


Uses Node.js - (ensure that node.js is installed.)

Supported File types: tracks all files / folders, and populates key columns with data from: .js, .json, .html, .cs, .py, .css, and .mjs file types.

Instructions for use:
Place entire project folder within this /Source folder.
Open a Terminal, and type in the command:

npm install

and then, 

node Source/Tools/CSVTools/update-csv-workflow.mjs

If you want to run the command to produce the full terminal results in a workflow LOG, use this command:

node Source/Tools/CSVTools/update-csv-workflow.mjs 2>&1 | tee Documentation/logs/workflow-$(date +%Y%m%d-%H%M%S).log

After Generating the new .csv, you'll see it in the Source/ProjectMap folder.  It'll be named: SourceFolder(With Date and Time).  Check it over.  If satisfactory, replace the original existing SourceFolder.csv with the new one!

View Spreadsheets by importing the .csv into Google Sheets, organize rows / columns layout view further, perform sorts, and more.