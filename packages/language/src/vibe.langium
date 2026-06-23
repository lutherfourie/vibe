// Vibe v0 grammar — growing TDD-style. See:
//   docs/superpowers/specs/2026-05-13-vibe-language-v0.md
//   docs/superpowers/plans/2026-05-13-vibe-v0-sd1-language.md

grammar Vibe

entry Project:
    declarations+=Declaration*;

Declaration:
    Agent | Route | Fallback | Persona | Provider | Surface | Memory | Harness | Plugin | Trigger | Corrected
    | AutonomousSession | Lane | Checkpoint | SelfReview | ResearchStep
    | Tool | Eval | Template | Policy | Workflow
    | Character | FrameReview | ConsistencyGuard
    | Rule | Director;

Agent:
    'agent' name=ID '{' fields+=Field* '}';

Route:
    'route' from=ID '->' to=QualifiedName ('{' fields+=Field* '}')?;

Fallback:
    'fallback' '->' to=QualifiedName ('{' fields+=Field* '}')?;

Persona:
    'persona' name=ID '{' fields+=Field* '}';

Provider:
    'provider' name=QualifiedName '{' fields+=Field* '}';

Surface:
    'surface' name=QualifiedName '{' fields+=Field* '}';

Memory:
    'memory' name=ID '{' fields+=Field* '}';

Harness:
    'harness' name=ID '{' fields+=Field* '}';

Plugin:
    'plugin' name=ID '{' fields+=Field* '}';

Trigger:
    'trigger' kind=('every' | 'on') schedule=STRING '{' fields+=Field* '}';

Corrected:
    'corrected' 'for' target=STRING '{' fields+=Field* '}';

AutonomousSession:
    'autonomous-session' name=ID '{' fields+=Field* '}';

Lane:
    'lane' name=ID '{' fields+=Field* '}';

Checkpoint:
    'checkpoint' name=ID '{' fields+=Field* '}';

SelfReview:
    'self-review' name=ID '{' fields+=Field* '}';

ResearchStep:
    'research-step' name=ID '{' fields+=Field* '}';

Tool:
    'tool' name=ID '{' fields+=Field* '}';

Eval:
    'eval' name=ID '{' fields+=Field* '}';

Template:
    'template' name=ID '{' fields+=Field* '}';

Policy:
    'policy' name=ID '{' fields+=Field* '}';

Workflow:
    'workflow' name=ID '{' fields+=Field* '}';

Character:
    'character' name=ID '{' fields+=Field* '}';

FrameReview:
    'frame-review' name=ID '{' fields+=Field* '}';

ConsistencyGuard:
    'consistency-guard' name=ID '{' fields+=Field* '}';

// Conditional feel/director primitives (additive). A `rule` or `director`
// body mixes ordinary Fields (metadata: name, cadence, weights) with `when ...
// then ...` Guard blocks (conditional logic). Guards are ONLY reachable inside
// these two declarations, so the data-only Field/Expression rules used by every
// existing primitive are left byte-identical — current .vibe files lex and parse
// exactly as before. Grounds the gamespree Feel Compiler's conditional director
// rules (combo-break shake thresholds, wave/derangement music gates, intent
// stress/mastery threshold gates) as first-class vibe constructs.
Rule:
    'rule' name=ID '{' (fields+=Field | guards+=Guard)* '}';

Director:
    'director' name=ID '{' (fields+=Field | guards+=Guard)* '}';

// `when { <condition> } then { <assignment>* }`. The condition is a boolean
// expression over comparison/logical operators; the then-block is a list of
// `<reference> = <expression>` assignments (the feel knobs to set when the
// guard fires). Range operand (`lo .. hi`) supports the combo-break shake
// lerp-endpoints pattern (amp = 0.08 .. 0.22).
Guard:
    'when' '{' condition=Condition '}' 'then' '{' assignments+=Assignment* '}';

// Left-associative boolean expression. Logical (`&&`, `||`) binds looser than
// comparison (`==`, `!=`, `>`, `>=`, `<`, `<=`); parentheses force grouping.
Condition infers Condition:
    Disjunction;

Disjunction infers Condition:
    Conjunction ({infer LogicalExpr.left=current} operator='||' right=Conjunction)*;

Conjunction infers Condition:
    Comparison ({infer LogicalExpr.left=current} operator='&&' right=Comparison)*;

Comparison infers Condition:
    Primary ({infer ComparisonExpr.left=current} operator=('==' | '!=' | '>=' | '<=' | '>' | '<') right=Primary)?;

Primary infers Condition:
    '(' Condition ')' | Operand;

Operand infers Condition:
    {infer Operand} (ref=Reference | number=NumberLiteral | string=StringLiteral | boolean=BooleanLiteral);

Assignment:
    target=Reference '=' value=RangeOrExpression;

// A then-assignment value is either a plain Expression (reusing the existing
// data Expression rule) or a numeric range `lo .. hi` (lerp endpoints).
RangeOrExpression infers RangeOrExpression:
    Range | ExpressionValue;

Range infers RangeOrExpression:
    {infer Range} low=NumberLiteral '..' high=NumberLiteral;

ExpressionValue infers RangeOrExpression:
    {infer ExpressionValue} value=Expression;

QualifiedName:
    segments+=ID ('.' segments+=ID)*;

Field:
    name=Name (':' type=TypeReference)? '=' value=Expression;

// Name lets structural-primitive keywords appear as identifiers in identifier
// positions — Reference / TypeReference segments, Field names, ObjectEntry
// keys. Each primitive task (Tasks 7-14) must append its keyword here.
// Autonomous primitives (autonomous-session, lane, checkpoint, self-review,
// research-step) appended for long-horizon support (aligns to resolver/schemas.ts).
// `true`, `false`, `null` are deliberately excluded — they stay reserved for
// the literal expressions so the parser can never ambiguate `x = true`.
// Declaration headers still bind `name=ID` so declaration names cannot collide
// with structural keywords; the Task 15 validator enforces the same constraint
// for `true`/`false`/`null` and any future literal-shaped keyword.
Name returns string:
    ID | 'agent' | 'route' | 'persona' | 'provider' | 'surface' | 'fallback' | 'memory' | 'harness' | 'plugin' | 'trigger' | 'corrected' | 'for'
    | 'autonomous-session' | 'lane' | 'checkpoint' | 'self-review' | 'research-step'
    | 'tool' | 'eval' | 'template' | 'policy' | 'workflow' | 'character' | 'frame-review' | 'consistency-guard'
    | 'rule' | 'director' | 'when' | 'then';

TypeReference:
    segments+=Name ('.' segments+=Name)*;

Expression:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral
    | Reference | ListExpression | ObjectExpression;

ListExpression:
    {infer ListExpression} '[' (items+=Expression (',' items+=Expression)* ','?)? ']';

ObjectExpression:
    {infer ObjectExpression} '{' (entries+=ObjectEntry (',' entries+=ObjectEntry)* ','?)? '}';

ObjectEntry:
    key=Name '=' value=Expression;

Reference:
    segments+=Name ('.' segments+=Name)*;

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
