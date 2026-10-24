"""Passively match configured X11 shortcuts; never grab, replay, or block keys."""
import ctypes as C
import json
import os
import re
import signal
import subprocess
import sys

class KeyEvent(C.Structure):
    _fields_ = [('type', C.c_int), ('serial', C.c_ulong), ('send_event', C.c_int), ('display', C.c_void_p), ('window', C.c_ulong), ('root', C.c_ulong), ('subwindow', C.c_ulong), ('time', C.c_ulong), ('x', C.c_int), ('y', C.c_int), ('x_root', C.c_int), ('y_root', C.c_int), ('state', C.c_uint), ('keycode', C.c_uint), ('same_screen', C.c_int)]

class Event(C.Union):
    _fields_ = [('type', C.c_int), ('key', KeyEvent), ('pad', C.c_long * 24)]

class ErrorEvent(C.Structure):
    _fields_ = [('type', C.c_int), ('display', C.c_void_p), ('resourceid', C.c_ulong), ('serial', C.c_ulong), ('error_code', C.c_ubyte), ('request_code', C.c_ubyte), ('minor_code', C.c_ubyte)]

class ModifierMap(C.Structure):
    _fields_ = [('max_keypermod', C.c_int), ('modifiermap', C.POINTER(C.c_ubyte))]

class Cookie(C.Structure):
    _fields_ = [('type', C.c_int), ('serial', C.c_ulong), ('send_event', C.c_int), ('display', C.c_void_p), ('extension', C.c_int), ('evtype', C.c_int), ('cookie', C.c_uint), ('data', C.c_void_p)]
class Raw(C.Structure):
    _fields_ = [('type', C.c_int), ('serial', C.c_ulong), ('send_event', C.c_int), ('display', C.c_void_p), ('extension', C.c_int), ('evtype', C.c_int), ('time', C.c_ulong), ('deviceid', C.c_int), ('sourceid', C.c_int), ('detail', C.c_int), ('flags', C.c_int)]
class EventMask(C.Structure):
    _fields_ = [('deviceid', C.c_int), ('mask_len', C.c_int), ('mask', C.POINTER(C.c_ubyte))]

def emit(**data):
    print(json.dumps(data), flush=True)

def main():
    parent = os.getppid()
    libc = C.CDLL(None)
    libc.prctl.argtypes = [C.c_int, C.c_ulong, C.c_ulong, C.c_ulong, C.c_ulong]
    libc.prctl.restype = C.c_int
    if parent == 1 or libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != parent:
        return
    config = json.loads(sys.stdin.readline())
    # Keysyms alone are ambiguous: two different physical keys can emit a
    # decimal separator. Resolve the XKB physical names instead.
    result = subprocess.run(['xkbcomp', '-xkb', os.environ.get('DISPLAY', ''), '-'], capture_output=True, text=True, timeout=4, check=True)
    physical = {name: int(code) for name, code in re.findall(r'^\s*<([^>]+)>\s*=\s*(\d+)\s*;', result.stdout, re.M)}
    aliases = dict(re.findall(r'^\s*alias\s*<([^>]+)>\s*=\s*<([^>]+)>\s*;', result.stdout, re.M))
    for _ in range(4):
        for name, target in aliases.items():
            if target in physical: physical[name] = physical[target]
    keypad_names = {**{f'KP_{n}': [f'KP{n}'] for n in range(10)}, 'KP_Add': ['KPAD'], 'KP_Subtract': ['KPSU'], 'KP_Multiply': ['KPMU'], 'KP_Divide': ['KPDV'], 'KP_Decimal': ['KPDL'], 'KP_Separator': ['KPPT', 'KPCO', 'I129'], 'KP_Enter': ['KPEN'], 'KP_Equal': ['KPEQ']}
    x = C.CDLL('libX11.so.6')
    signatures = {
        'XOpenDisplay': ([C.c_char_p], C.c_void_p),
        'XDefaultRootWindow': ([C.c_void_p], C.c_ulong),
        'XStringToKeysym': ([C.c_char_p], C.c_ulong),
        'XKeysymToKeycode': ([C.c_void_p, C.c_ulong], C.c_ubyte),
        'XGetModifierMapping': ([C.c_void_p], C.POINTER(ModifierMap)),
        'XFreeModifiermap': ([C.POINTER(ModifierMap)], C.c_int),
        'XSync': ([C.c_void_p, C.c_int], C.c_int),
        'XNextEvent': ([C.c_void_p, C.POINTER(Event)], C.c_int),
        'XCloseDisplay': ([C.c_void_p], C.c_int),
    }
    for name, (args, result) in signatures.items():
        method = getattr(x, name); method.argtypes = args; method.restype = result
    display = x.XOpenDisplay(None)
    if not display:
        raise RuntimeError('Não foi possível acessar a sessão X11 para os atalhos do numpad.')
    root = x.XDefaultRootWindow(display)
    errors = []
    error_handler_type = C.CFUNCTYPE(C.c_int, C.c_void_p, C.POINTER(ErrorEvent))
    @error_handler_type
    def error_handler(_, event):
        errors.append(event.contents.error_code)
        return 0
    x.XSetErrorHandler.argtypes = [error_handler_type]
    x.XSetErrorHandler(error_handler)
    def keycode(name):
        return x.XKeysymToKeycode(display, x.XStringToKeysym(name.encode('ascii')))
    mapping = x.XGetModifierMapping(display)
    def mask_for(names, default=0):
        codes = {keycode(name) for name in names} - {0}
        result = 0
        for index in range(8):
            for slot in range(mapping.contents.max_keypermod):
                if mapping.contents.modifiermap[index * mapping.contents.max_keypermod + slot] in codes:
                    result |= 1 << index
        return result or default
    masks = {'CTRL': mask_for(['Control_L', 'Control_R'], 4), 'ALT': mask_for(['Alt_L', 'Alt_R'], 8), 'SHIFT': mask_for(['Shift_L', 'Shift_R'], 1), 'WIN': mask_for(['Super_L', 'Super_R'], 64)}
    ignored = {0, 2, mask_for(['Num_Lock']), 2 | mask_for(['Num_Lock'])}
    ignored_mask = 0
    for value in ignored: ignored_mask |= value
    x.XFreeModifiermap(mapping)
    try:
        x.XkbSetDetectableAutoRepeat.argtypes = [C.c_void_p, C.c_int, C.POINTER(C.c_int)]
        x.XkbSetDetectableAutoRepeat(display, 1, C.byref(C.c_int()))
    except AttributeError:
        pass
    # Observe raw master-device events. There are no passive/active grabs, so
    # the focused app receives the exact original events, including keypad keys.
    xi = C.CDLL('libXi.so.6')
    x.XQueryExtension.argtypes = [C.c_void_p, C.c_char_p, C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int)]
    opcode, event_base, error_base = C.c_int(), C.c_int(), C.c_int()
    if not x.XQueryExtension(display, b'XInputExtension', C.byref(opcode), C.byref(event_base), C.byref(error_base)):
        raise RuntimeError('XInput2 is required for non-blocking shortcuts.')
    xi.XIQueryVersion.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)]
    major, minor = C.c_int(2), C.c_int(0)
    if xi.XIQueryVersion(display, C.byref(major), C.byref(minor)) != 0:
        raise RuntimeError('XInput2 2.0 is required.')
    mask = (C.c_ubyte * 2)(0, (1 << (13 - 8)) | (1 << (14 - 8)))
    selection = EventMask(1, 2, mask)  # XIAllMasterDevices
    xi.XISelectEvents.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(EventMask), C.c_int]
    xi.XISelectEvents(display, root, C.byref(selection), 1)
    x.XGetEventData.argtypes = [C.c_void_p, C.POINTER(Cookie)]
    x.XFreeEventData.argtypes = [C.c_void_p, C.POINTER(Cookie)]
    x.XSync(display, 0)
    actions = {}
    for binding in config:
        names = keypad_names.get(binding['keysym'])
        code = next((physical[n] for n in names if n in physical), 0) if names else keycode(binding['keysym'])
        modifiers = 0
        for modifier in binding['modifiers']: modifiers |= masks[modifier]
        if not code:
            emit(event='rejected', id=binding['id'], message='Key not available in this keyboard map.')
            continue
        actions[(code, modifiers)] = binding['id']
    modifier_codes = {}
    for name, symbols in {'CTRL':['Control_L','Control_R'], 'ALT':['Alt_L','Alt_R'], 'SHIFT':['Shift_L','Shift_R'], 'WIN':['Super_L','Super_R']}.items():
        for symbol in symbols: modifier_codes[keycode(symbol)] = masks[name]
    interesting = {code for code, _ in actions} | set(modifier_codes)
    pressed = set()
    x.XQueryKeymap.argtypes = [C.c_void_p, C.c_void_p]
    initial = (C.c_ubyte * 32)(); x.XQueryKeymap(display, initial)
    pressed.update(code for code in interesting if initial[code // 8] & (1 << (code % 8)))
    emit(event='ready', ids=list(actions.values()))
    try:
        while True:
            event = Event(); x.XNextEvent(display, C.byref(event))
            if event.type != 35: continue
            cookie = C.cast(C.byref(event), C.POINTER(Cookie))
            if cookie.contents.extension != opcode.value or not x.XGetEventData(display, cookie): continue
            try:
                raw = C.cast(cookie.contents.data, C.POINTER(Raw)).contents
                code = raw.detail
                if code not in interesting: continue
                if raw.evtype == 14: pressed.discard(code)
                elif raw.evtype == 13:
                    repeat = code in pressed or bool(raw.flags & (1 << 16))
                    pressed.add(code)
                    if repeat: continue
                    modifiers = 0
                    for down in pressed: modifiers |= modifier_codes.get(down, 0)
                    action = actions.get((code, modifiers))
                    if action is not None: emit(event='pressed', id=action)
            finally: x.XFreeEventData(display, cookie)
    finally: x.XCloseDisplay(display)

if __name__ == '__main__':
    # Default SIGTERM releases the passive observer connection.
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    try:
        main()
    except Exception as error:
        emit(event='error', message=str(error)); sys.exit(1)
