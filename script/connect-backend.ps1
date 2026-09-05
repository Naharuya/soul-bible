[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $SshArguments
)

ssh soul-bible-server @SshArguments
exit $LASTEXITCODE
