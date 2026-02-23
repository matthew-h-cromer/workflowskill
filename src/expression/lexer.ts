// Lexer for the WorkflowSkill expression language.
// Tokenizes expressions like: $steps.fetch.output.messages.length >= 5

export type TokenType =
  | 'DOLLAR_REF'   // $inputs, $steps, $item, $index
  | 'DOT'          // .
  | 'IDENTIFIER'   // field names, property names
  | 'NUMBER'       // integer or float literals
  | 'STRING'       // "string" or 'string' literals
  | 'BOOLEAN'      // true, false
  | 'NULL'         // null
  | 'EQ'           // ==
  | 'NEQ'          // !=
  | 'GT'           // >
  | 'GTE'          // >=
  | 'LT'           // <
  | 'LTE'          // <=
  | 'AND'          // &&
  | 'OR'           // ||
  | 'NOT'          // !
  | 'LPAREN'       // (
  | 'RPAREN'       // )
  | 'LBRACKET'     // [
  | 'RBRACKET'     // ]
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export class LexError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = 'LexError';
  }
}

export function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    // Skip whitespace
    if (/\s/.test(input[pos]!)) {
      pos++;
      continue;
    }

    const ch = input[pos]!;

    // Dollar references: $inputs, $steps, $item, $index, $result
    if (ch === '$') {
      const start = pos;
      pos++; // skip $
      let name = '';
      while (pos < input.length && /[a-zA-Z_]/.test(input[pos]!)) {
        name += input[pos]!;
        pos++;
      }
      if (!name) {
        throw new LexError(`Expected identifier after $`, start);
      }
      tokens.push({ type: 'DOLLAR_REF', value: name, position: start });
      continue;
    }

    // Dot
    if (ch === '.') {
      tokens.push({ type: 'DOT', value: '.', position: pos });
      pos++;
      continue;
    }

    // Parentheses
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: pos });
      pos++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: pos });
      pos++;
      continue;
    }

    // Brackets
    if (ch === '[') {
      tokens.push({ type: 'LBRACKET', value: '[', position: pos });
      pos++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'RBRACKET', value: ']', position: pos });
      pos++;
      continue;
    }

    // Two-character operators
    if (pos + 1 < input.length) {
      const twoChar = input[pos]! + input[pos + 1]!;
      if (twoChar === '==') {
        tokens.push({ type: 'EQ', value: '==', position: pos });
        pos += 2;
        continue;
      }
      if (twoChar === '!=') {
        tokens.push({ type: 'NEQ', value: '!=', position: pos });
        pos += 2;
        continue;
      }
      if (twoChar === '>=') {
        tokens.push({ type: 'GTE', value: '>=', position: pos });
        pos += 2;
        continue;
      }
      if (twoChar === '<=') {
        tokens.push({ type: 'LTE', value: '<=', position: pos });
        pos += 2;
        continue;
      }
      if (twoChar === '&&') {
        tokens.push({ type: 'AND', value: '&&', position: pos });
        pos += 2;
        continue;
      }
      if (twoChar === '||') {
        tokens.push({ type: 'OR', value: '||', position: pos });
        pos += 2;
        continue;
      }
    }

    // Single-character operators
    if (ch === '>') {
      tokens.push({ type: 'GT', value: '>', position: pos });
      pos++;
      continue;
    }
    if (ch === '<') {
      tokens.push({ type: 'LT', value: '<', position: pos });
      pos++;
      continue;
    }
    if (ch === '!') {
      tokens.push({ type: 'NOT', value: '!', position: pos });
      pos++;
      continue;
    }

    // Number literals
    if (/[0-9]/.test(ch) || (ch === '-' && pos + 1 < input.length && /[0-9]/.test(input[pos + 1]!))) {
      const start = pos;
      if (ch === '-') pos++;
      while (pos < input.length && /[0-9]/.test(input[pos]!)) pos++;
      if (pos < input.length && input[pos] === '.') {
        pos++;
        while (pos < input.length && /[0-9]/.test(input[pos]!)) pos++;
      }
      tokens.push({ type: 'NUMBER', value: input.slice(start, pos), position: start });
      continue;
    }

    // String literals
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = pos;
      pos++; // skip opening quote
      let str = '';
      while (pos < input.length && input[pos] !== quote) {
        if (input[pos] === '\\' && pos + 1 < input.length) {
          pos++; // skip backslash
        }
        str += input[pos]!;
        pos++;
      }
      if (pos >= input.length) {
        throw new LexError(`Unterminated string literal`, start);
      }
      pos++; // skip closing quote
      tokens.push({ type: 'STRING', value: str, position: start });
      continue;
    }

    // Identifiers (also matches true, false, null)
    if (/[a-zA-Z_]/.test(ch)) {
      const start = pos;
      while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos]!)) pos++;
      const word = input.slice(start, pos);
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'BOOLEAN', value: word, position: start });
      } else if (word === 'null') {
        tokens.push({ type: 'NULL', value: word, position: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: word, position: start });
      }
      continue;
    }

    throw new LexError(`Unexpected character: ${ch}`, pos);
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}
