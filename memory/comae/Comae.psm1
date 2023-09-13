﻿
# Copyright (c) Magnet Forensics, Inc.
# Licensed under the MIT License.

function Test-Administrator  
{  
    $user = [Security.Principal.WindowsIdentity]::GetCurrent();
    (New-Object Security.Principal.WindowsPrincipal $user).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)  
}

<#
.SYNOPSIS
    Return the path to Comae Toolkit executables.

.DESCRIPTION
    This will automatically detect the current machine architecture, and provide the
    correct path to the Comae binaries.

.EXAMPLE
    Return value
    PS C:\> Get-ComaeToolkitPath
#>
Function Get-ComaeToolkitPath(
)
{
    $arch = "x64"
    if ($env:Processor_Architecture -eq "x86") { $arch = "x86" }
    if ($env:PROCESSOR_IDENTIFIER.StartsWith("ARM")) { $arch = "ARM64" }

    $RootPath = $PSScriptRoot + "\" + $arch;
    $DumpItPath = $RootPath + "\DumpIt.exe"
    if ((Test-Path  $DumpItPath) -ne $True) {
        Write-Error "This script needs to be in the root folder. '$RootPath\DumpIt.exe' could not be found."
        Return 1
    }

    $RootPath
}

<#
.SYNOPSIS
    Create a full memory Microsoft crash dump.

.DESCRIPTION
    This script creates a memory image into the target directory using DumpIt. 

.PARAMETER Directory
    Destination folder for the output file.

.PARAMETER IsCompress
    Enables compression for the output file. Useful for large memory images.
    Memory images can be uncompressed using z2dmp available in the toolkit,
    but also on GitHub as an opensource software in 
    Rust (https://github.com/comaeio/z2dmp-rust/) and 
    C (https://github.com/comaeio/z2dmp/)

.EXAMPLE
    Creates a compressed memory image into the given target folder.
    PS C:\> New-ComaeDumpFile -Directory C:\Dumps -IsCompress
#>
Function New-ComaeDumpFile(
    [Parameter(Mandatory = $True)] [string] $Directory,
    [Parameter(Mandatory = $False)] [switch] $IsCompress
    )
{
    $ToolkitPath = Get-ComaeToolkitPath

    if ((Test-Path $Directory) -ne $True) {
        $out = New-Item $Directory -ItemType "Directory"
    }

    if ((Test-Administrator) -ne $True) {
        Write-Error "This command requires administrator privileges."
        Return 1
    }

    $DateTime = Get-Date

    $Date = [String]::Format("{0}-{1:00}-{2:00}", $DateTime.Year, $DateTime.Month, $DateTime.Day)
    $Time = [String]::Format("{0:00}-{1:00}-{2:00}", $DateTime.Hour, $DateTime.Minute, $DateTime.Second)

    if ($IsCompress) {
        $Extension = "zdmp"
        $Compression = "/COMPRESS"
    }
    else {
        $Extension = "dmp"
        $Compression = "/NOCOMPRESS"
    }

    $DumpFile = "$Directory\$env:COMPUTERNAME-$Date-$Time.$Extension"

    Write-Host "Launching $ToolkitPath\DumpIt.exe..."
    $out = iex "$ToolkitPath\DumpIt.exe /quiet $Compression /output $DumpFile"

    Return $DumpFile
}

<#
.SYNOPSIS
    Send a memory file to the Comae Platform.

.DESCRIPTION
    Send a DumpIt generated memory image either by DumpIt or New-ComaeDumpFile to the Comae
    platform. This image can be sent to a custom endpoint too.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.

.PARAMETER Path
    Path to memory image generated by DumpIt.

.PARAMETER ItemType
    Optional. File (default).

.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.
    
.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling 
    Get-ComaeCases.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private
    instances.

.EXAMPLE
    Send a memory image to a custom Comae endpoint.
    PS C:\> Send-ComaeDumpFile -Hostname $Hostname -Token $Token -ItemType File
     -OrganizationId $OrganizationId -CaseId $CaseId -Path $FileDump
#>
Function Send-ComaeDumpFile(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $Path,
    [Parameter(Mandatory = $False)] [string] $ItemType="File",
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
    )
{
    if ($ItemType -eq "Directory") {
        Write-Error "This parameter is absolete. Please use New-ComaeDumpFile."
        Return 1
    }
    elseif ($ItemType -eq "File") {
        $DumpFile = $Path
    }
    else {
        Write-Error "Please provide -ItemType parameter as Directory or File."
        Return 1
    }

    if ((Test-Path $DumpFile) -ne $True) {
        Write-Error "Could not find dump file '$DumpFile'"
        Return 1
    }

    $1MB = 1024 * 1024
    $ChunkSize = 16 * $1MB

    $Buffer = New-Object byte[] $ChunkSize
    $FileSizeInBytes = (Get-Item $DumpFile).Length
    $FileSizeInMB = [Math]::Round($FileSizeInBytes / $1MB)
    $CurrentInBytes = 0
    $ChunkNumber = 0

    $NumberOfChunks = [Math]::Ceiling($FileSizeInBytes / $ChunkSize)

    $FileName = Split-Path $DumpFile -Leaf
    $FileNameEscaped = ([uri]::EscapeDataString($FileName)).Replace('%','')
    $ticketId = [guid]::NewGuid(). ToString()

    $GetEncoding = [System.Text.Encoding]::GetEncoding("iso-8859-1")
    $FileStream = [System.IO.File]::OpenRead($DumpFile)

    $Boundary = -Join ((65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
    $Boundary = "boundary" + $boundary
        
    $LF = "`r`n"
    $BodyTemplate = (
        "--$Boundary",
        "Content-Disposition: form-data; name=`"filename`"$LF",
        $FileNameEscaped,
        "--$Boundary",
        "Content-Disposition: form-data; name=`"ticketId`"$LF",
        $ticketId,
        "--$Boundary",
        "Content-Disposition: form-data; name=`"organizationId`"$LF",
        $organizationId,
        "--$Boundary",
        "Content-Disposition: form-data; name=`"caseId`"$LF",
        $caseId,
        "--$Boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$FileNameEscaped`"",
        "Content-Type: application/octet-stream$LF",
        "{0}",
        "--$Boundary--$LF"
    ) -join $LF

    while ($ChunkNumber -lt $NumberOfChunks) {
        $BytesRead = $FileStream.Read($Buffer, 0, $ChunkSize)
        $Content = $GetEncoding.GetString($Buffer, 0, $BytesRead)
        $Body = $BodyTemplate -f $Content

        $rangeStart = $ChunkNumber * $ChunkSize;
        $rangeEnd = $rangeStart + $BytesRead;

        $ContentRange = "bytes " + $rangeStart + "-" + $rangeEnd + "/" + $FileSizeInBytes;
        $Headers = @{
            "Authorization" = "Bearer " + $Token;
            "Content-Range" = $ContentRange;
            "Content-Type" = "multipart/form-data; boundary=$Boundary";
        };
            
        $Uri = "https://" + $Hostname + "/api/upload-parts?chunkSize=$BytesRead&chunk=$ChunkNumber&originalname=$FileNameEscaped&total=$NumberOfChunks&organizationId=$OrganizationId&caseId=$CaseId&ticket=$ticketId"

        $CurrentInMB = [Math]::Round($CurrentInBytes / $1MB)
        Write-Progress -Activity "Uploading $DumpFile..." -Status "$CurrentInMB MB / $FileSizeInMB MB" -PercentComplete (($CurrentInBytes / $FileSizeInBytes) * 100)        

        do {
            $Response = try {
                (Invoke-WebRequest -Uri $Uri -Headers $Headers -Method Post -Body $Body -TimeoutSec 86400 -UseBasicParsing).BaseResponse
            } catch [System.Net.WebException] { 
                Write-Host "An exception was caught: $($_.Exception.Message)"
                $_.Exception.Response
            }
        } while ($Response.StatusCode -ne 200)

        $CurrentInBytes += $BytesRead
        $CurrentInMB = [Math]::Round($CurrentInBytes / $1MB)
        $ChunkNumber += 1

        Write-Progress -Activity "Uploading $DumpFile..." -Status "$CurrentInMB MB / $FileSizeInMB MB" -PercentComplete (($CurrentInBytes / $FileSizeInBytes) * 100)
    }

    $FileStream.Close()

    $DumpFile
}

<#
.SYNOPSIS
    Send a memory snapshot archive to the Comae Platform.

.DESCRIPTION
    Send a mem2json generated memory snapshot either by mem2json or New-ComaeDumpFile to the Comae
    platform. This image can be sent to a custom endpoint too.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.

.PARAMETER Path
    Path to memory snapshot generated by mem2json.

.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.
    
.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling 
    Get-ComaeCases.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private
    instances.

.EXAMPLE
    Send a memory snapshot archive to a custom Comae endpoint.
    PS C:\> Send-ComaeSnapshotFile -Hostname $Hostname -Token $Token
     -OrganizationId $OrganizationId -CaseId $CaseId -Path $FileDump
#>
Function Send-ComaeSnapshotFile(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $Path,
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
    )
{
    if ((Test-Path $Path) -ne $True) {
        Write-Error "Could not find dump file '$Path'"
        Return 1
    }

    $FileSizeInBytes = (Get-Item $Path).Length

    $FileName = Split-Path $Path -Leaf
    $FileNameEscaped = ([uri]::EscapeDataString($FileName)).Replace('%','')

    $GetEncoding = [System.Text.Encoding]::GetEncoding("iso-8859-1")
    $FileStream = [System.IO.File]::OpenRead($Path)

    $Boundary = -Join ((65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
    $Boundary = "boundary" + $boundary
        
    $LF = "`r`n"
    $BodyTemplate = (
        "--$Boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$FileNameEscaped`"",
        "Content-Type: application/octet-stream$LF",
        "{0}",
        "--$Boundary--$LF"
    ) -join $LF
    
    if ($FileSizeInBytes) {
        $Buffer = [System.IO.File]::ReadAllBytes($Path)
        $Content = $GetEncoding.GetString($Buffer, 0, $FileSizeInBytes)
        $Body = $BodyTemplate -f $Content

        $Headers = @{
            "Authorization" = "Bearer " + $Token;
            "Content-Type" = "multipart/form-data; boundary=$Boundary";
        };
            
        $Uri = "https://" + $Hostname + "/api/upload-json?organizationId=$OrganizationId&caseId=$CaseId"

        Write-Host "Sending $Path..."
        $Response = try {
            (Invoke-WebRequest -Uri $Uri -Headers $Headers -Method Post -Body $Body -TimeoutSec 86400 -UseBasicParsing).BaseResponse
        } catch [System.Net.WebException] { 
            Write-Host "An exception was caught: $($_.Exception.Message)"
            $_.Exception.Response
        }

        if ($Response.StatusCode -ne 200) {
            Write-Error "Failed."
        } else {
            Write-Host "Success."
        }
    }
}

<#
.SYNOPSIS
    Invoke DumpIt on a remote Windows Azure Virtual Machine, and send it to the Comae platform.

.DESCRIPTION
    The cmdlet remotely acquire the memory of a remote Windows Azure Virtual Machine by calling
    a run command 'RunPowerShellScript' through Invoke-AzVMRunCommand and automatically send it
    to the Comae platform.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.

.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.
    
.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling 
    Get-ComaeCases.

.PARAMETER ResourceGroupName
    The resource group name where the Azure virtual machine belongs to.

.PARAMETER VMName
    The name of the Azure virtual machine.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private
    instances.

.EXAMPLE
    Invoke a run command 'RunPowerShellScript' with overriding the script 'ComaeRespond.ps1' on a
    Windows VM named '$VMName' in resource group '$rgname'.
    PS C:\> Invoke-ComaeAzVMWinAnalyze -Token $Token -OrganizationId $OrganizationId -CaseId $CaseId
    -ResourceGroupName $rgname -VMName $VMName
#>
Function Invoke-ComaeAzVMWinAnalyze(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $True)] [string] $ResourceGroupName,
    [Parameter(Mandatory = $True)] [string] $VMName,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
) {
    if ((Test-Path  '.\ComaeRespond.ps1') -ne $True) {
        Write-Error "This script needs to be in the same directory as '.\ComaeRespond.ps1'."
        Return $False
    }

    if (!(Get-Module -ListAvailable -Name Az.Compute)) {
        Write-Error "You need to install Azure PowerShell Az module. (Install-Module -Name Az -AllowClobber)"
        Return $False
    }

    if ((Get-AzContext) -eq $null) { Connect-AzAccount }
    Invoke-AzVMRunCommand -ResourceGroupName $ResourceGroupName -Name $VMName -CommandId 'RunPowerShellScript' -ScriptPath '.\ComaeRespond.ps1' -Parameter @{Token=$Token; Hostname=$Hostname; OrganizationId=$OrganizationId; CaseId=$CaseId}
}

<#
.SYNOPSIS
    Unimplemented.

.DESCRIPTION
    The cmdlet remotely acquire the memory of a remote Linux Azure Virtual Machine and
    automatically send it to the Comae platform.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.

.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.
    
.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling 
    Get-ComaeCases.

.PARAMETER ResourceGroupName
    The resource group name where the Azure virtual machine belongs to.

.PARAMETER VMName
    The name of the Azure virtual machine.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private
    instances.

.EXAMPLE
    Invoke a run command 'RunPowerShellScript' with overriding the script 'ComaeRespond.sh' on a
    Linux VM named '$VMName' in resource group '$rgname'.
    PS C:\> Invoke-ComaeAzVMLinAnalyze -Token $Token -OrganizationId $OrganizationId -CaseId $CaseId
    -ResourceGroupName $rgname -VMName $VMName
#>
Function Invoke-ComaeAzVMLinAnalyze(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $True)] [string] $ResourceGroupName,
    [Parameter(Mandatory = $True)] [string] $VMName,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
) {
    Write-Error "This current cmdlet is not implemented yet."
    # if ((Test-Path  '.\ComaeRespond.sh') -ne $True) {
    # 	Write-Error "This script needs to be in the same directory as '.\ComaeRespond.sh'."
    #     Return 1
    # }

    # az vm run-command invoke -g myResourceGroup -n myVm --command-id RunShellScript --scripts "sudo apt-get update && sudo apt-get install -y nginx"
    # if ((Get-AzContext) -eq $null) { Connect-AzAccount }
    # Invoke-AzVMRunCommand -ResourceGroupName $ResourceGroupName -Name $VMName -CommandId 'RunShellScript' -ScriptPath '.\ComaeAzureIR.sh' -Parameter @{ClientId = $ClientId; ClientSecret = $ClientSecret}
}

<#
.SYNOPSIS
    Invoke DumpIt on a remote Windows Aws Virtual Machine, and send it to the Comae platform.

.DESCRIPTION
    The cmdlet remotely acquire the memory of a remote Windows Aws Virtual Machine by calling
    the AWS Systems Manager SendCommand API and automatically send it to the Comae platform.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.
    
.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.
    
.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling 
    Get-ComaeCases.

.PARAMETER AccessKey
    Aws Access Key (optional). Only used if Get-AWSCredentials is null.
    
.PARAMETER SecretKey
    Aws Secret Key (optional). Only used if Get-AWSCredentials is null.

.PARAMETER Region
    The region where the Aws virtual machine belongs to.

.PARAMETER InstanceId
    The instance id of the Aws virtual machine.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private
    instances.

.EXAMPLE
    Invoke a SSM run command with overriding the script 'ComaeRespond.ps1' on a
    Windows VM instance id '$instanceid' in region '$region'.
    PS C:\> Invoke-ComaeAwsVMWinAnalyze -Token $Token -OrganizationId $OrganizationId -CaseId $CaseId
    -Region $region -InstanceId $instanceid
#>
Function Invoke-ComaeAwsVMWinAnalyze(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $False)] [string] $AccessKey = $null,
    [Parameter(Mandatory = $False)] [string] $SecretKey = $null,
    [Parameter(Mandatory = $True)] [string] $Region,
    [Parameter(Mandatory = $True)] [string] $InstanceId,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
) {
    if ((Test-Path  '.\ComaeRespond.ps1') -ne $True) {
        Write-Error "This script needs to be in the same directory as '.\ComaeRespond.ps1'."
        Return 1
    }

    if (!(Get-Module -ListAvailable -Name AWSPowerShell.NetCore)) {
        Write-Error "You need to install AWS Tools for PowerShell. (Install-Module -Name AWSPowerShell.NetCore -AllowClobber)"
        Return $False
    }

    if ((Get-AWSCredentials -ProfileName default) -eq $null) {
	    if ([string]::IsNullOrEmpty($AccessKey) -or [string]::IsNullOrEmpty($SecretKey)) {
	       Write-Error "You need to log in to your AWS account. Use -AccessKey and -SecretKey"
	       Return $False
	    }
	    else
	    {
	    	Set-AWSCredentials –AccessKey $AccessKey –SecretKey $SecretKey
	    }
    }

    Set-DefaultAWSRegion -Region $Region

    # Create a copy of ComaeRespond.ps1 on the remote machine's Temp folder.
    $content = Get-Content .\ComaeRespond.ps1 -Raw
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
    $Parameter = @{'commands'=@("`$encoded = '$b64'",
                                '$content = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))',
                                '$tmpPath = [System.IO.Path]::GetTempPath()',
                                '$tmpFileName = "comae" + $(Get-Date -Format yyyy-MM-dd) + ".ps1"'
                                '$tmpFile = $tmpPath + $tmpFileName',
                                '$content | Out-File $tmpFile -Force',
                                'Write-Host "Tmp file at: $tmpFile"',
                                'Set-Location $tmpPath',
                                "& `$tmpFile -Token '$Token' -Hostname '$Hostname' -OrganizationId '$OrganizationId' -CaseId '$CaseId'")}
    try{
        $SSMCommand = Send-SSMCommand -InstanceId $InstanceId -DocumentName AWS-RunPowerShellScript -Comment 'Cloud Incident Response with Comae' -Parameter $Parameter
    } catch {
        if ($_.FullyQualifiedErrorId -like "*Amazon.SimpleSystemsManagement.Model.InvalidInstanceIdException*") {
            Write-Error "Invalid Instance ID, does the AMI have a version of the EC2 config service installed which is compatible with SSM?"
            return
        }

        Write-Error $_.exception.message
    }

    Get-SSMCommandInvocation -CommandId $SSMCommand.CommandId -Details $true | Select-Object -ExpandProperty CommandPlugins
}

<#
.SYNOPSIS
    Unimplemented.

.DESCRIPTION
    The cmdlet remotely acquire the memory of a remote Linux Aws Virtual Machine by calling
    the AWS Systems Manager SendCommand API and automatically send it to the Comae platform.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.
    
.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.

.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling 
    Get-ComaeCases.

.PARAMETER AccessKey
    Optional. Aws Access Key. Only used if Get-AWSCredentials is null.
    
.PARAMETER SecretKey
    Optional. Aws Secret Key. Only used if Get-AWSCredentials is null.

.PARAMETER Region
    The region where the Aws virtual machine belongs to.

.PARAMETER InstanceId
    The instance id of the Aws virtual machine.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private instances.

.EXAMPLE
    Invoke a SSM run command with overriding the script 'ComaeRespond.sh' on a
    Linux VM instance id '$instanceid' in region '$region'.
    PS C:\> Invoke-ComaeAwsVMLinAnalyze -Token $Token -OrganizationId $OrganizationId -CaseId $CaseId
    -Region $region -InstanceId $instanceid
#>
Function Invoke-ComaeAwsVMLinAnalyze(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $False)] [string] $AccessKey,
    [Parameter(Mandatory = $False)] [string] $SecretKey,
    [Parameter(Mandatory = $True)] [string] $Region,
    [Parameter(Mandatory = $True)] [string] $InstanceId,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
) {
    Write-Error "This current cmdlet is not implemented yet."
}

<#
.SYNOPSIS
    Invoke DumpIt on a remote Windows AD instance, and send it to the Comae platform.

.DESCRIPTION
    The cmdlet remotely acquire the memory of a remote Windows Machine Machine that is
    part of the Active Directory domain through the Invoke-Command cmdlet and automatically
    send it to the Comae platform.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.
    
.PARAMETER OrganizationId
    The organization id can be retrieved in the user interface or by calling 
    Get-ComaeOrganizations.
    
.PARAMETER CaseId
    The case id can be retrieved in the user interface or by calling Get-ComaeCases.

.PARAMETER ComputerName
    The name of the machine in the Active Directory domain.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private instances.

.EXAMPLE
    Invoke a Active Directory run command with overriding the script 'ComaeRespond.ps1' on a
    Windows VM machine name '$machinename'.
    PS C:\> Invoke-ComaeAwsVMWinAnalyze -Token $Token -OrganizationId $OrganizationId -CaseId $CaseId
    -ComputerName $machinename.
#>
Function Invoke-ComaeADWinAnalyze(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $True)] [string] $OrganizationId,
    [Parameter(Mandatory = $True)] [string] $CaseId,
    [Parameter(Mandatory = $True)] [string] $ComputerName,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
) {
    if ((Test-Path  '.\ComaeRespond.ps1') -ne $True) {
        Write-Error "This script needs to be in the same directory as '.\ComaeRespond.ps1'."
        Return 1
    }

    $clientArgs = ($Token, $OrganizationId, $CaseId, $Hostname)
    if (Test-Connection -ComputerName $ComputerName -Quiet) {
        Invoke-Command -ComputerName $ComputerName -FilePath .\ComaeRespond.ps1 -ArgumentList $clientArgs
    } else {
        Write-Error "Invoke-Command can not be used on the remote machine."
    }
}

<#
.SYNOPSIS
    Get the list of organizations the token belongs to.

.DESCRIPTION
    Get the list of organizations the token belongs to.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private instances.

.EXAMPLE
    Get list
    PS C:\> $Organizations = Get-ComaeOrganizations -Token $Token
#>
Function Get-ComaeOrganizations (
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
    )
{
    $Headers = @{
        "Authorization" = "Bearer " + $Token;
        "Content-Type" = "application/json; charset=utf-8";
        "Accept" = "*/*";
        "Accept-Encoding" = "gzip, deflate, br";
        "pragma" = "no-cache";
        "cache-control" = "no-cache"
    }

    # Always on central (beta.comae.tech)
    $Uri = "https://" + $Hostname + "/api/organizations"

    $Response = Invoke-WebRequest -Uri $Uri -Method Get -Headers $Headers -TimeoutSec 86400 -UseBasicParsing

    if ($Response.StatusCode -eq 200) {
        ($Response.Content | ConvertFrom-JSON) | Format-Table -Property id, name, clearanceLevel
    }

}

<#
.SYNOPSIS
    Get the list of cases the token belongs to.

.DESCRIPTION
    Get the list of cases the token belongs to.

.PARAMETER Token
    Bearer token generated by the user on via the user interface of the Comae platform.

.PARAMETER OrganizationId
    Optional. If this parameter is null or empty, all the cases from all the organization
    will be returned.

.PARAMETER Hostname
    Default hostname is beta.comae.tech but this can be changed for private instances.

.EXAMPLE
    Get list
    PS C:\> $Organizations = Get-ComaeOrganizations -Token $Token
#>
Function Get-ComaeCases(
    [Parameter(Mandatory = $True)] [string] $Token,
    [Parameter(Mandatory = $False)] [string] $OrganizationId="",
    [Parameter(Mandatory = $False)] [string] $Hostname="beta.comae.tech"
    )
{
    $Headers = @{
        "Authorization" = "Bearer " + $Token;
        "Content-Type" = "application/json; charset=utf-8";
        "Accept" = "*/*";
        "Accept-Encoding" = "gzip, deflate, br";
        "pragma" = "no-cache";
        "cache-control" = "no-cache"
    }

    $Result = @()

    if ([string]::IsNullOrEmpty($OrganizationId)) {
        $Uri = "https://" + $Hostname + "/api/organizations"

        $Response = Invoke-WebRequest -Uri $Uri -Method Get -Headers $Headers -TimeoutSec 86400 -UseBasicParsing
        if ($Response.StatusCode -eq 200) {
            Foreach ($orgId in ($Response.Content | ConvertFrom-JSON)) {
                $Uri = "https://" + $Hostname + "/api/organizations/" + $orgId.id + "/cases"
                $Response = Invoke-WebRequest -Uri $Uri -Method Get -Headers $Headers -TimeoutSec 86400 -UseBasicParsing

                if ($Response.StatusCode -eq 200) {
                    $Result += ($Response.Content | ConvertFrom-JSON)
                }
            }
        }
    } else {
        $Uri = "https://" + $Hostname + "/api/organizations/" + $organizationId + "/cases"

        $Response = Invoke-WebRequest -Uri $Uri -Method Get -Headers $Headers -TimeoutSec 86400 -UseBasicParsing

        if ($Response.StatusCode -eq 200) {
            $Result += ($Response.Content | ConvertFrom-JSON)
        }
    }

    $Result | Format-Table -Property organizationId, id, clearanceLevel, name, description, creationDate, labels
}

 Export-ModuleMember -Function Get-ComaeCases, Get-ComaeOrganizations, Invoke-ComaeADWinAnalyze, Invoke-ComaeAwsVMWinAnalyze, Invoke-ComaeAzVMWinAnalyze, Send-ComaeDumpFile, Send-ComaeSnapshotFile, New-ComaeDumpFile, Get-ComaeToolkitPath