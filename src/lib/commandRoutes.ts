import type { ActionName, MoveInput } from '../types';

export type CommandRouteFamily =
  | 'neutral'
  | 'direction'
  | 'motion'
  | 'sidestep'
  | 'crouch'
  | 'whileStanding'
  | 'ki'
  | 'chord'
  | 'jump'
  | 'special'
  | 'command';

export const inputToButton: Record<MoveInput, string> = {
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4'
};

export const buttonToInput: Record<string, MoveInput> = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

export const baseInputToAnimationKey: Record<MoveInput, string> = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};

export const rawButtonCommandToBaseKey: Record<string, string> = {
  '1': 'jableft',
  '2': 'jabright',
  '3': 'kickleft',
  '4': 'kickright'
};

const inputToAction: Record<MoveInput, ActionName> = {
  jab: 'jab',
  heavy: 'heavy',
  kick: 'kick',
  special: 'special'
};

export function commandAnimationKey(command: string) {
  return rawButtonCommandToBaseKey[command] ?? `cmd:${command}`;
}

export function isPlainNeutralCommand(command: string) {
  return command === '1' || command === '2' || command === '3' || command === '4';
}

export function commandInput(command: string): MoveInput {
  const buttons = [...command.matchAll(/[1-4]/g)];
  const button = buttons[buttons.length - 1]?.[0] ?? '1';
  return buttonToInput[button] ?? 'jab';
}

export function parseNotationTokens(command: string) {
  return command
    .replace(/^H\./, 'H.+')
    .replace(/^R\./, 'R.+')
    .split('+')
    .filter(Boolean);
}

export function commandRouteFamily(command: string | undefined): CommandRouteFamily {
  if (!command) return 'neutral';
  if (command.startsWith('O+')) return 'ki';
  if (command.startsWith('FC+')) return 'crouch';
  if (command.startsWith('WS+') || command.startsWith('iWS+')) return 'whileStanding';
  if (command.startsWith('SS+') || command.startsWith('SSL+') || command.startsWith('SSR+')) return 'sidestep';
  if (/^(qcf|qcb|hcf|hcb|dp|rdp|cd|WR|iWR|f,f|b,b)\+/.test(command)) return 'motion';
  if (/^(H\.|R\.)/.test(command)) return 'special';
  if (/^[1-4](\+[1-4])+$/.test(command)) return 'chord';
  if (/^(u|U|u\/f|U\/F|u\/b|U\/B)\+/.test(command)) return 'jump';
  if (/^(f|F|b|B|d|D|d\/f|D\/F|d\/b|D\/B)\+/.test(command)) return 'direction';
  return isPlainNeutralCommand(command) ? 'neutral' : 'command';
}

export function commandFamilyKey(command: string | undefined, input: MoveInput) {
  const family = commandRouteFamily(command);
  if (!command || family === 'neutral') return `neutral:${input}`;
  if (family === 'direction') {
    const prefix = command.split('+').slice(0, -1).join('+') || 'direction';
    return `${prefix.replace(/[1-4]/g, '#')}:${input}`;
  }
  return `${family}:${input}`;
}

export function commandRequiresKi(command: string | undefined) {
  return Boolean(command?.startsWith('O+'));
}

export function commandUsesJump(command: string | undefined, notation: string[] = []) {
  return notation.some((token) => {
    const normalized = token.toLowerCase();
    return normalized === 'u' || normalized.includes('u/') || normalized.includes('/u');
  }) ||
    Boolean(command && /(^|[+,_])u([+,_]|$)|(^|[+,_])u\/[bf]([+,_]|$)/.test(command.toLowerCase()));
}

export function commandToActions(command: string | undefined, input: MoveInput): ActionName[] {
  const actions = new Set<ActionName>();
  const notation = command ?? inputToButton[input];
  const family = commandRouteFamily(command);
  if (family === 'ki') actions.add('charge');
  if (family === 'crouch') actions.add('down');
  if (family === 'sidestep') {
    if (notation.startsWith('SSR+')) actions.add('sidestepDown');
    else actions.add('sidestepUp');
  }
  const prefix = notation.split('+')[0] ?? '';
  if (prefix.includes('f')) actions.add('right');
  if (prefix.includes('b')) actions.add('left');
  if (prefix.includes('d')) actions.add('down');
  if (prefix.includes('u')) actions.add('up');
  for (const button of notation.match(/[1-4]/g) ?? [inputToButton[input]]) {
    const moveInput = buttonToInput[button];
    if (moveInput) actions.add(inputToAction[moveInput]);
  }
  return [...actions];
}
