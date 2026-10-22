import sys

lines = open('src/components/admin/AdminAiSettingsTab.tsx', encoding='utf-8').read().split('\n')

# Reconstruct from line 2058 (index 2057) onwards with correct structure
head = lines[:2058]  # up to line 2057 inclusive (provider card close)

# Add correct closing structure with proper indentation
head.extend([
    '                    <p className="text-xs text-ink-muted mt-1">Click to fetch live models from provider /models endpoint</p>',  # line 2059
    '                  </div>',          # line 2060 - closes grid (16 spaces)
    '              </div>',              # line 2061 - closes space-y-4 (14 spaces)
    '          </div>',                  # line 2062 - closes container (10 spaces)
    '        </div>',                    # line 2063 - closes keys inner div (8 spaces)
    '      )}',                          # line 2064 - closes keys conditional (6 spaces)
    '',                                  # blank line
])

# Find where models tab starts
for i in range(2065, len(lines)):
    if '{activeTab' in lines[i] and 'models' in lines[i]:
        head.extend(lines[i:])
        break

open('src/components/admin/AdminAiSettingsTab.tsx', 'w', encoding='utf-8').write('\n'.join(head))
print('Fixed indentation and structure')