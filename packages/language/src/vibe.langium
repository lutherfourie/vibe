// Vibe v0 grammar — growing TDD-style. See:
//   docs/superpowers/specs/2026-05-13-vibe-language-v0.md
//   docs/superpowers/plans/2026-05-13-vibe-v0-sd1-language.md

grammar Vibe

entry Project:
    declarations+=Declaration*;

Declaration:
    Agent | Route | Persona;

Agent:
    'agent' name=ID '{' '}';

Route:
    'route' from=ID '->' to=ID;

Persona:
    'persona' name=ID '{' fields+=Field* '}';

Field:
    name=ID '=' value=Expression;

Expression:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral
    | Reference | ListExpression | ObjectExpression;

ListExpression:
    {infer ListExpression} '[' (items+=Expression (',' items+=Expression)* ','?)? ']';

ObjectExpression:
    {infer ObjectExpression} '{' (entries+=ObjectEntry (',' entries+=ObjectEntry)* ','?)? '}';

ObjectEntry:
    key=ID '=' value=Expression;

// `true`, `false`, `null` are reserved keywords and cannot appear as Reference
// segments — Task 15 will reject declarations whose names collide with reserved
// words to keep this constraint enforceable.
Reference:
    segments+=ID ('.' segments+=ID)*;

StringLiteral:
    value=STRING;

NumberLiteral:
    value=NUMBER;

BooleanLiteral:
    value=('true' | 'false');

NullLiteral:
    {infer NullLiteral} 'null';

hidden terminal WS: /\s+/;
terminal ID: /[a-zA-Z_][\w]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
terminal NUMBER returns number: /-?[0-9]+(\.[0-9]+)?/;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
