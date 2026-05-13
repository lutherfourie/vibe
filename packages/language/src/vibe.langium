// Vibe placeholder grammar.
//
// This grammar is intentionally minimal — it exists to prove the Langium
// pipeline end-to-end (parser, AST, LSP, TextMate emission). The real Vibe
// syntax is being designed in a separate Path A brainstorm; once that lands,
// this file gets replaced wholesale. Do NOT extend this grammar in passing.

grammar Vibe

entry Project:
    declarations+=Declaration*;

Declaration:
    Agent | Route;

Agent:
    'agent' name=ID '{' '}';

Route:
    'route' from=ID '->' to=ID;

hidden terminal WS: /\s+/;
terminal ID: /[a-zA-Z_][\w]*/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
