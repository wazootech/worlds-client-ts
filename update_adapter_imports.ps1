$files = Get-ChildItem -Path . -Recurse -File -Include *.ts,*.md,deno.json

foreach ($file in $files) {
    $content = Get-Content -Raw $file.FullName
    $newContent = $content
    
    $newContent = $newContent -replace '@/client/adapters/libsql/rdfjs-store/sql/', '@/client/adapters/libsql/'
    $newContent = $newContent -replace '@/client/adapters/libsql/rdfjs-store/sync/', '@/client/adapters/libsql/'
    $newContent = $newContent -replace '@/client/adapters/denokv/rdfjs-store/sync/', '@/client/adapters/denokv/'
    
    if ($content -cne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "Updated $($file.FullName)"
    }
}
