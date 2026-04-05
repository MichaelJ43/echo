; Echo NSIS hooks — keep shortcut name in sync with tauri.conf.json "productName".
; Tauri's uninstall only deletes the desktop .lnk when IsShortcutTarget matches the
; install path; after $INSTDIR is removed that check can fail, leaving the shortcut.

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
    SetShellVarContext all
    ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
