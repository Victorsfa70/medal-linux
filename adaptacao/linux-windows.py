#!/usr/bin/env python3
"""Read visible X11 application windows, never process command lines or input."""
import ctypes as C
import ctypes.util
import json
import os
from pathlib import Path
import sys

X = C.CDLL(ctypes.util.find_library('X11'))
Window = C.c_ulong
Display = C.c_void_p
X.XOpenDisplay.argtypes = [C.c_char_p]; X.XOpenDisplay.restype = Display
X.XDefaultRootWindow.argtypes = [Display]; X.XDefaultRootWindow.restype = Window
X.XInternAtom.argtypes = [Display, C.c_char_p, C.c_int]; X.XInternAtom.restype = Window
X.XGetWindowProperty.argtypes = [Display, Window, Window, C.c_long, C.c_long, C.c_int, Window, C.POINTER(Window), C.POINTER(C.c_int), C.POINTER(Window), C.POINTER(Window), C.POINTER(C.POINTER(C.c_ubyte))]
X.XQueryTree.argtypes = [Display, Window, C.POINTER(Window), C.POINTER(Window), C.POINTER(C.POINTER(Window)), C.POINTER(C.c_uint)]
X.XGetWindowAttributes.argtypes = [Display, Window, C.c_void_p]
X.XFree.argtypes = [C.c_void_p]
X.XCloseDisplay.argtypes = [Display]
# X errors caused by a window closing during enumeration must not terminate us.
ERROR = C.CFUNCTYPE(C.c_int, Display, C.c_void_p)
ignore_error = ERROR(lambda *_: 0)
X.XSetErrorHandler.argtypes = [ERROR]; X.XSetErrorHandler(ignore_error)
class Attributes(C.Structure):
    _fields_ = [('x', C.c_int), ('y', C.c_int), ('width', C.c_int), ('height', C.c_int), ('border_width', C.c_int), ('depth', C.c_int), ('visual', C.c_void_p), ('root', Window), ('class_', C.c_int), ('bit_gravity', C.c_int), ('win_gravity', C.c_int), ('backing_store', C.c_int), ('backing_planes', Window), ('backing_pixel', Window), ('save_under', C.c_int), ('colormap', Window), ('map_installed', C.c_int), ('map_state', C.c_int), ('all_event_masks', C.c_long), ('your_event_mask', C.c_long), ('do_not_propagate_mask', C.c_long), ('override_redirect', C.c_int), ('screen', C.c_void_p)]

def main():
    if os.environ.get('XDG_SESSION_TYPE') == 'wayland':
        raise RuntimeError('Game window selection requires an X11 session. Wayland is not supported yet.')
    display = X.XOpenDisplay(None)
    if not display:
        raise RuntimeError('Cannot open the X11 display.')
    root = X.XDefaultRootWindow(display)
    def atom(name): return X.XInternAtom(display, name.encode(), 0)
    def prop(window, name):
        kind, fmt, count, remaining = Window(), C.c_int(), Window(), Window()
        data = C.POINTER(C.c_ubyte)()
        code = X.XGetWindowProperty(display, window, atom(name), 0, 16384, 0, 0, C.byref(kind), C.byref(fmt), C.byref(count), C.byref(remaining), C.byref(data))
        if code or not data: return None
        try:
            if fmt.value == 32:
                values = C.cast(data, C.POINTER(Window))
                return [values[i] for i in range(count.value)]
            if fmt.value == 8: return C.string_at(data, count.value).decode('utf-8', 'replace')
        finally: X.XFree(data)
    windows = prop(root, '_NET_CLIENT_LIST_STACKING') or prop(root, '_NET_CLIENT_LIST')
    if not windows:
        actualroot, parent, children, count = Window(), Window(), C.POINTER(Window)(), C.c_uint()
        X.XQueryTree(display, root, C.byref(actualroot), C.byref(parent), C.byref(children), C.byref(count))
        windows = [children[i] for i in range(count.value)]
        if children: X.XFree(children)
    excluded = {atom('_NET_WM_WINDOW_TYPE_' + t) for t in ['DESKTOP', 'DOCK', 'TOOLTIP', 'MENU', 'DROPDOWN_MENU', 'POPUP_MENU', 'NOTIFICATION', 'SPLASH']}
    rows = []
    for window in windows:
        a = Attributes()
        if not X.XGetWindowAttributes(display, window, C.byref(a)) or a.map_state != 2 or a.override_redirect or a.width < 64 or a.height < 64: continue
        if excluded.intersection(prop(window, '_NET_WM_WINDOW_TYPE') or []): continue
        if atom('_NET_WM_STATE_HIDDEN') in (prop(window, '_NET_WM_STATE') or []): continue
        title = (prop(window, '_NET_WM_NAME') or prop(window, 'WM_NAME') or '').strip('\x00').strip()
        classes = (prop(window, 'WM_CLASS') or '').strip('\x00').split('\x00')
        if not title or not any(classes): continue
        pid = (prop(window, '_NET_WM_PID') or [0])[0]
        try: executable_path = os.readlink(f'/proc/{pid}/exe'); executable = Path(executable_path).name
        except OSError: executable_path = ''; executable = classes[0]
        application_id = prop(window, '_GTK_APPLICATION_ID') or prop(window, '_KDE_NET_WM_DESKTOP_FILE') or ''
        rows.append(dict(windowId=str(window), pid=pid, title=title, className=classes[-1], instance=classes[0], executable=executable, executablePath=executable_path, applicationId=application_id, width=a.width, height=a.height, x=0, y=0, display=os.environ.get('DISPLAY')))
    print(json.dumps({'windows': rows, 'activeWindow': str((prop(root, '_NET_ACTIVE_WINDOW') or [0])[0])}, ensure_ascii=False))
    X.XCloseDisplay(display)

if __name__ == '__main__':
    try: main()
    except Exception as error: print(str(error), file=sys.stderr); sys.exit(1)
