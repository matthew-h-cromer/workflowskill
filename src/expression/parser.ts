// Recursive-descent parser for the WorkflowSkill expression language.
// Produces an AST from the token stream.

import type { Token, TokenType } from './lexer.js';

// ─── AST node types ───────────────────────────────────────────────────────────

export type ASTNode =
  | ReferenceNode
  | PropertyAccessNode
  | IndexAccessNode
  | LiteralNode
  | BinaryNode
  | UnaryNode;

/** $inputs, $steps, $item, $index, $result */
export interface ReferenceNode {
  kind: 'reference';
  name: string; // "inputs", "steps", "item", "index"
}

/** a.b.c property access chain */
export interface PropertyAccessNode {
  kind: 'property_access';
  object: ASTNode;
  property: string;
}

/** a[expr] bracket index access */
export interface IndexAccessNode {
  kind: 'index_access';
  object: ASTNode;
  index: ASTNode;
}

/** Literal values: number, string, boolean, null */
export interface LiteralNode {
  kind: 'literal';
  value: string | number | boolean | null;
}

/** Binary operations: ==, !=, >, <, >=, <=, &&, || */
export interface BinaryNode {
  kind: 'binary';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

/** Unary operations: ! */
export interface UnaryNode {
  kind: 'unary';
  operator: string;
  operand: ASTNode;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export class ParseExprError extends Error {
  constructor(message: string, public readonly position: number) {
    super(message);
    this.name = 'ParseExprError';
  }
}

export function parseExpression(tokens: Token[]): ASTNode {
  let pos = 0;

  function current(): Token {
    return tokens[pos]!;
  }

  function expect(type: TokenType): Token {
    const tok = current();
    if (tok.type !== type) {
      throw new ParseExprError(
        `Expected ${type} but got ${tok.type} ("${tok.value}")`,
        tok.position,
      );
    }
    pos++;
    return tok;
  }

  function peek(): Token {
    return tokens[pos]!;
  }

  // Grammar (precedence low to high):
  // expression     → or_expr
  // or_expr        → and_expr ( "||" and_expr )*
  // and_expr       → comparison ( "&&" comparison )*
  // comparison     → unary ( ("==" | "!=" | ">" | "<" | ">=" | "<=") unary )?
  // unary          → "!" unary | primary
  // primary        → reference_chain | literal | "(" expression ")"

  function parseOr(): ASTNode {
    let left = parseAnd();
    while (peek().type === 'OR') {
      const op = current().value;
      pos++;
      const right = parseAnd();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  function parseAnd(): ASTNode {
    let left = parseComparison();
    while (peek().type === 'AND') {
      const op = current().value;
      pos++;
      const right = parseComparison();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  function parseComparison(): ASTNode {
    let left = parseUnary();
    const t = peek().type;
    if (t === 'EQ' || t === 'NEQ' || t === 'GT' || t === 'GTE' || t === 'LT' || t === 'LTE') {
      const op = current().value;
      pos++;
      const right = parseUnary();
      left = { kind: 'binary', operator: op, left, right };
    }
    return left;
  }

  function parseUnary(): ASTNode {
    if (peek().type === 'NOT') {
      const op = current().value;
      pos++;
      const operand = parseUnary();
      return { kind: 'unary', operator: op, operand };
    }
    return parsePrimary();
  }

  function parsePrimary(): ASTNode {
    const tok = peek();

    // Parenthesized expression
    if (tok.type === 'LPAREN') {
      pos++;
      const expr = parseOr();
      expect('RPAREN');
      return expr;
    }

    // Dollar reference with possible property chain
    if (tok.type === 'DOLLAR_REF') {
      pos++;
      let node: ASTNode = { kind: 'reference', name: tok.value };
      // Postfix chain: .field or [expr]
      while (peek().type === 'DOT' || peek().type === 'LBRACKET') {
        if (peek().type === 'DOT') {
          pos++; // skip dot
          const prop = current();
          if (prop.type === 'IDENTIFIER' || prop.type === 'DOLLAR_REF') {
            pos++;
            node = { kind: 'property_access', object: node, property: prop.value };
          } else if (prop.type === 'NUMBER') {
            // Array index access: .0, .1
            pos++;
            node = { kind: 'property_access', object: node, property: prop.value };
          } else {
            throw new ParseExprError(
              `Expected property name after '.', got ${prop.type}`,
              prop.position,
            );
          }
        } else {
          // LBRACKET — bracket index access: [expr]
          pos++; // skip [
          const indexExpr = parseOr();
          expect('RBRACKET');
          node = { kind: 'index_access', object: node, index: indexExpr };
        }
      }
      return node;
    }

    // Number literal
    if (tok.type === 'NUMBER') {
      pos++;
      const num = tok.value.includes('.') ? parseFloat(tok.value) : parseInt(tok.value, 10);
      return { kind: 'literal', value: num };
    }

    // String literal
    if (tok.type === 'STRING') {
      pos++;
      return { kind: 'literal', value: tok.value };
    }

    // Boolean literal
    if (tok.type === 'BOOLEAN') {
      pos++;
      return { kind: 'literal', value: tok.value === 'true' };
    }

    // Null literal
    if (tok.type === 'NULL') {
      pos++;
      return { kind: 'literal', value: null };
    }

    throw new ParseExprError(
      `Unexpected token: ${tok.type} ("${tok.value}")`,
      tok.position,
    );
  }

  const ast = parseOr();

  // Ensure we consumed all tokens (except EOF)
  if (peek().type !== 'EOF') {
    const leftover = peek();
    throw new ParseExprError(
      `Unexpected token after expression: ${leftover.type} ("${leftover.value}")`,
      leftover.position,
    );
  }

  return ast;
}
