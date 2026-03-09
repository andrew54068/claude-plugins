# Browser MCP Tools - Full Comparison

## Overview

| Attribute | Chrome DevTools MCP | Playwright MCP | Chrome MCP | Browser MCP | BrowserTools MCP | Notes |
|---|---|---|---|---|---|---|
| Positioning | Chrome deep debugging | Cross-browser automation/testing | Chrome basic automation | Chrome basic automation | Chrome monitoring & interaction | See individual positioning |
| Tech basis | Chrome DevTools Protocol | Playwright framework | CDP simplified wrapper | WebSocket + Chrome extension | CDP simplified wrapper | / |
| Browser support | Chrome/Chromium only | Chrome, Firefox, Safari, Edge | Chrome/Chromium only | Chrome/Chromium only | Chrome/Chromium + Firefox (partial) | Playwright MCP is the only one supporting cross-browser |
| Config complexity | Simple, nearly one-step | Simple, nearly one-step | Most complex (extension + package manager + path debugging) | Complex (extension + config) | Complex (extension + config) | Chrome DevTools MCP and Playwright MCP don't require browser extensions; the others do |
| Tool count | 26 | 22 | 22 | 13 | 14 | Playwright MCP has the most diverse tool types and quantity |
| Login state | Supported (needs simple config) | Supported (needs complex config) | Supported (default) | Supported (default) | Supported (default) | All support login state persistence, but Playwright MCP needs extra config |

## Browser & Page Control

| Capability | Chrome DevTools MCP | Playwright MCP | Chrome MCP | Browser MCP | BrowserTools MCP | Notes |
|---|---|---|---|---|---|---|
| Tab navigation | navigate_page | browser_navigate | chrome_navigate | navigate | - | Same function, different names |
| Navigation history | navigate_page_history | browser_navigate_back | chrome_go_back_or_forward | goBack, goForward | - | Same function, different names |
| New tab | new_page | browser_tabs | get_windows_and_tabs | - | - | Chrome DevTools MCP splits into 4 tools; Playwright MCP uses 1 unified tool |
| List tabs | list_pages | - | - | - | - | - |
| Select tab | select_page | - | chrome_switch_tab (switch page) | - | - | - |
| Close tab | close_page | browser_close | chrome_close_tabs | - | - | First three MCPs open new tabs for automation, so they all have close tab operations |
| Cross-tab search | - | - | search_tabs_content | - | - | Chrome MCP unique tool, but Chrome DevTools MCP and Playwright MCP have similar distributed capabilities |
| Extract HTML/text | - | - | chrome_get_web_content | - | - | - |
| Find clickable elements | - | - | chrome_get_interactive_elements | - | - | - |
| Browser install | - | browser_install | - | - | - | Playwright unique feature |
| Browser history search | - | - | chrome_history | - | - | Bookmark automation is Chrome MCP unique |
| Bookmark search | - | - | chrome_bookmark_search | - | - | - |
| Bookmark add | - | - | chrome_bookmark_add | - | - | - |
| Bookmark delete | - | - | chrome_bookmark_delete | - | - | - |

## Interaction & DOM Operations

| Capability | Chrome DevTools MCP | Playwright MCP | Chrome MCP | Browser MCP | BrowserTools MCP | Notes |
|---|---|---|---|---|---|---|
| Click | click | browser_click | chrome_click_element | getSelectedElement | - | Same function, different names |
| Drag & drop | drag | browser_drag | - | drag | - | Same function, different names |
| Hover | hover | browser_hover | - | hover | - | Same function, different names |
| Keyboard input | type (in fill) | browser_type | chrome_keyboard | type | - | Same function, different names |
| Independent key press | - | browser_press_key | - | pressKey | - | Chrome has no independent key tool |
| Form fill | fill | browser_fill_form | chrome_fill_or_select (simulates keyboard input and shortcuts) | - | - | Same function, different names |
| Select dropdown | select_option | browser_select_option | - | selectOption | - | Same function, different names |
| File upload | upload_file | browser_file_upload | - | - | - | Same function, different names |
| Dialog handling | handle_dialog | browser_handle_dialog | - | - | - | Same function, different names |
| Wait for condition | wait_for | browser_wait_for | - | wait | - | Same function, different names |

## Debugging & Monitoring

| Capability | Chrome DevTools MCP | Playwright MCP | Chrome MCP | Browser MCP | BrowserTools MCP | Notes |
|---|---|---|---|---|---|---|
| JS execution | evaluate_script | browser_evaluate | chrome_inject_script, chrome_send_command_to_inject_script | - | - | Same function, different names |
| Console messages | list_console_messages, get_console_message | browser_console_messages | chrome_console | getConsoleLogs | getConsoleLogs, getConsoleErrors | Chrome DevTools splits into list/detail tools; Playwright unified |
| Network monitoring | list_network_requests, get_network_request | browser_network_requests | chrome_network_capture_start/stop, chrome_network_debugger_start/stop, chrome_network_request | - | getNetworkErrors, getNetworkLogs | Chrome DevTools splits into list/detail tools; Playwright unified |
| Clear stored logs | - | - | - | - | wipeLogs | BrowserTools MCP unique feature |

## Visual & Environment Simulation

| Capability | Chrome DevTools MCP | Playwright MCP | Chrome MCP | Browser MCP | BrowserTools MCP | Notes |
|---|---|---|---|---|---|---|
| CPU/network emulation | emulate_cpu, emulate_network | - | - | - | - | Chrome DevTools MCP unique feature |
| Resize window | resize_page | browser_resize | - | - | - | Same function, different names |
| Screenshot | take_screenshot | browser_take_screenshot | chrome_screenshot | screenshot | takeScreenshot | Same function, different names |
| Snapshot | take_snapshot | browser_snapshot | - | snapshot | - | Same function, different names |

## Performance Analysis & Auditing

| Capability | Chrome DevTools MCP | Playwright MCP | Chrome MCP | Browser MCP | BrowserTools MCP | Notes |
|---|---|---|---|---|---|---|
| Performance tracing | performance_start_trace, performance_stop_trace, performance_analyze_insight | - | - | - | - | Chrome DevTools MCP unique feature (process-oriented, analyzes page performance and locates issues) |
| Accessibility audit (WCAG) | - | - | - | - | runAccessibilityAudit | BrowserTools MCP unique feature (result-oriented, shows page performance) |
| Performance audit | - | - | - | - | runPerformanceAudit | - |
| SEO audit | - | - | - | - | runSEOAudit | - |
| Best practices audit | - | - | - | - | runBestPracticesAudit | - |
| Next.js audit | - | - | - | - | runNextJSAudit | - |
| Run all audits | - | - | - | - | runAuditMode | - |
| Debugger guidance | - | - | - | - | runDebuggerMode | - |
