$files = Get-ChildItem -Path . -Recurse -File -Include *.ts,*.md,deno.json

foreach ($file in $files) {
    $content = Get-Content -Raw $file.FullName
    $newContent = $content -replace '@/client/rdfjs-buffer/mod\.ts', '@/client/quad-store/mod.ts'
    $newContent = $newContent -replace '@/client/rdfjs-buffer/', '@/client/quad-store/'
    $newContent = $newContent -replace '@worlds/client/rdfjs-buffer', '@worlds/client/quad-store'
    
    if ($content -cne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "Updated $($file.FullName)"
    }
}
