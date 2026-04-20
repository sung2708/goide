$lines = Get-Content 'src\integration\gopls.rs'
$newFunc = Get-Content 'src\integration\new_func.txt'
$result = $lines[0..913] + $newFunc + $lines[1058..($lines.Length-1)]
$result | Set-Content 'src\integration\gopls.rs'
