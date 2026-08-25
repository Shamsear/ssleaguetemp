'use client'
import { CheckCircle, RefreshCw, BarChart2 } from 'lucide-react';

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase/config'
import { collection, getDocs } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { useModal } from '@/hooks/useModal'
import AlertModal from '@/components/modals/AlertModal'
import ConfirmModal from '@/components/modals/ConfirmModal'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import AuthGuard from '@/components/auth/AuthGuard';

interface FootballPlayer {
  id: string
  player_id: string
  name: string
  position?: string
  position_group?: string
  overall_rating?: number
  team?: {
    id: string
    name: string
  }
  is_auction_eligible?: boolean
  nationality?: string
  age?: number
  club?: string
}

const PLAYERS_PER_PAGE = 50

const EXPORT_POSITIONS_AND_GROUPS = [
  { type: 'position', name: 'GK', label: 'GK' },
  { type: 'position', name: 'LB', label: 'LB' },
  { type: 'position', name: 'RB', label: 'RB' },
  { type: 'position', name: 'CB', label: 'CB' },
  { type: 'group', name: 'CB-1', label: 'CB-1' },
  { type: 'group', name: 'CB-2', label: 'CB-2' },
  { type: 'position', name: 'DMF', label: 'DMF' },
  { type: 'group', name: 'DMF-1', label: 'DMF-1' },
  { type: 'group', name: 'DMF-2', label: 'DMF-2' },
  { type: 'position', name: 'CMF', label: 'CMF' },
  { type: 'group', name: 'CMF-1', label: 'CMF-1' },
  { type: 'group', name: 'CMF-2', label: 'CMF-2' },
  { type: 'position', name: 'AMF', label: 'AMF' },
  { type: 'group', name: 'AMF-1', label: 'AMF-1' },
  { type: 'group', name: 'AMF-2', label: 'AMF-2' },
  { type: 'position', name: 'LMF', label: 'LMF' },
  { type: 'position', name: 'RMF', label: 'RMF' },
  { type: 'position', name: 'LWF', label: 'LWF' },
  { type: 'position', name: 'RWF', label: 'RWF' },
  { type: 'position', name: 'SS', label: 'SS' },
  { type: 'position', name: 'CF', label: 'CF' },
  { type: 'group', name: 'CF-1', label: 'CF-1' },
  { type: 'group', name: 'CF-2', label: 'CF-2' }
]

export default function CommitteePlayersPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [players, setPlayers] = useState<FootballPlayer[]>([])
  const [filteredPlayers, setFilteredPlayers] = useState<FootballPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [eligibilityFilter, setEligibilityFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [teamsCache, setTeamsCache] = useState<Map<string, { id: string; name: string }>>(new Map())
  const [initialLoad, setInitialLoad] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportSoldFilter, setExportSoldFilter] = useState<'all' | 'sold' | 'unsold'>('all')
  const [exportMode, setExportMode] = useState<'combined' | 'individual'>('combined')
  const [selectedExportPositions, setSelectedExportPositions] = useState<string[]>(
    EXPORT_POSITIONS_AND_GROUPS.map(t => t.label)
  )

  const EXPORT_COLUMN_CATEGORIES = [
    {
      name: 'Basic Info',
      columns: [
        { key: 'player_id', label: 'Player ID' },
        { key: 'name', label: 'Name' },
        { key: 'position', label: 'Position' },
        { key: 'position_group', label: 'Position Group' },
        { key: 'overall_rating', label: 'Overall Rating' },
        { key: 'age', label: 'Age' },
        { key: 'nationality', label: 'Nationality' },
        { key: 'club', label: 'Club' },
        { key: 'team_name', label: 'Team Name' },
        { key: 'is_auction_eligible', label: 'Auction Eligible' },
        { key: 'is_sold', label: 'Is Sold' },
        { key: 'acquisition_value', label: 'Acquisition Value' },
        { key: 'playing_style', label: 'Playing Style' }
      ]
    },
    {
      name: 'Offensive Attributes',
      columns: [
        { key: 'offensive_awareness', label: 'Offensive Awareness' },
        { key: 'ball_control', label: 'Ball Control' },
        { key: 'dribbling', label: 'Dribbling' },
        { key: 'tight_possession', label: 'Tight Possession' },
        { key: 'low_pass', label: 'Low Pass' },
        { key: 'lofted_pass', label: 'Lofted Pass' },
        { key: 'finishing', label: 'Finishing' },
        { key: 'heading', label: 'Heading' },
        { key: 'set_piece_taking', label: 'Set Piece Taking' },
        { key: 'curl', label: 'Curl' }
      ]
    },
    {
      name: 'Physical Attributes',
      columns: [
        { key: 'speed', label: 'Speed' },
        { key: 'acceleration', label: 'Acceleration' },
        { key: 'kicking_power', label: 'Kicking Power' },
        { key: 'jumping', label: 'Jumping' },
        { key: 'physical_contact', label: 'Physical Contact' },
        { key: 'balance', label: 'Balance' },
        { key: 'stamina', label: 'Stamina' }
      ]
    },
    {
      name: 'Defensive Attributes',
      columns: [
        { key: 'defensive_awareness', label: 'Defensive Awareness' },
        { key: 'tackling', label: 'Tackling' },
        { key: 'aggression', label: 'Aggression' },
        { key: 'defensive_engagement', label: 'Defensive Engagement' }
      ]
    },
    {
      name: 'Goalkeeper Attributes',
      columns: [
        { key: 'gk_awareness', label: 'GK Awareness' },
        { key: 'gk_catching', label: 'GK Catching' },
        { key: 'gk_parrying', label: 'GK Parrying' },
        { key: 'gk_reflexes', label: 'GK Reflexes' },
        { key: 'gk_reach', label: 'GK Reach' }
      ]
    }
  ]

  const ALL_EXPORT_COLUMN_KEYS = EXPORT_COLUMN_CATEGORIES.flatMap(cat => cat.columns.map(col => col.key))
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(ALL_EXPORT_COLUMN_KEYS)

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage])

  // Fetch players with pagination and filters
  const fetchPlayers = useCallback(async () => {
    setLoading(true)

    try {
      console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Fetching players from Neon and teams from Firestore')

      // Build query params
      const params = new URLSearchParams({
        limit: PLAYERS_PER_PAGE.toString(),
        offset: ((currentPage - 1) * PLAYERS_PER_PAGE).toString(),
      })

      if (positionFilter) params.append('position', positionFilter)
      if (eligibilityFilter === 'eligible') {
        params.append('is_auction_eligible', 'true')
      } else if (eligibilityFilter === 'retired') {
        params.append('retired', 'true')
      } else if (eligibilityFilter === 'all_with_retired') {
        params.append('includeRetired', 'true')
      }
      if (searchTerm.trim()) params.append('search', searchTerm.trim())

      // Fetch teams from API and players from Neon
      const [teamsJson, playersResponse] = await Promise.all([
        fetch('/api/teams').then(r => r.json()),
        fetch(`/api/players?${params}`)
      ])

      const { data: playersData, success, totalCount } = await playersResponse.json()
      if (!success) {
        throw new Error('Failed to fetch players')
      }

      const teamsList = teamsJson.teams || teamsJson.data || []
      console.log(`Fetched ${playersData.length} players from Neon, ${teamsList.length} teams`)

      // Use the actual total count from API
      setTotalPlayers(totalCount || 0)

      // Build teams cache
      const teamsMap = new Map<string, { id: string; name: string }>()
      teamsList.forEach((team: any) => {
        teamsMap.set(team.id, {
          id: team.id,
          name: team.team_name || team.name
        })
      })
      setTeamsCache(teamsMap)

      // Map team data to players
      const playersWithTeams = playersData.map((player: any) => {
        let teamData = null
        if (player.team_id && teamsMap.has(player.team_id)) {
          teamData = teamsMap.get(player.team_id) || null
        }
        return {
          ...player,
          team: teamData
        }
      })

      setPlayers(playersWithTeams)
      setFilteredPlayers(playersWithTeams)
    } catch (err) {
      console.error('Error fetching players:', err)
      showAlert({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load players. Please try again.'
      })
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [currentPage, positionFilter, eligibilityFilter, searchTerm, showAlert])

  // Single effect to trigger fetch on any dependency change
  useEffect(() => {
    if (!user || user.role !== 'committee_admin') return

    // Debounce only for search term changes
    if (searchTerm) {
      const timer = setTimeout(() => {
        fetchPlayers()
      }, 300)
      return () => clearTimeout(timer)
    } else {
      // No debounce for other filters
      fetchPlayers()
    }
  }, [user, currentPage, positionFilter, eligibilityFilter, searchTerm, fetchPlayers])

  // No client-side filtering needed - all filtering is server-side now
  useEffect(() => {
    setFilteredPlayers(players)
  }, [players])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [positionFilter, eligibilityFilter, searchTerm])

  const handleDelete = async (playerId: string) => {
    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Delete Player',
      message: 'Are you sure you want to delete this player? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    try {
      const response = await fetchWithTokenRefresh(`/api/players/${playerId}`, {
        method: 'DELETE'
      })

      const { success } = await response.json()
      if (!success) {
        throw new Error('Failed to delete player')
      }

      setPlayers(players.filter(p => p.id !== playerId))
      alert('Player deleted successfully')
    } catch (err) {
      console.error('Error deleting player:', err)
      alert('Failed to delete player')
    }
  }

  const handleToggleRetired = async (playerId: string, name: string, isRetired: boolean) => {
    const actionText = isRetired ? 'reactivate' : 'retire';
    if (!confirm(`Are you sure you want to ${actionText} player "${name}"?`)) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/players/${playerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retired: !isRetired })
      })

      const result = await response.json()
      if (result.success) {
        alert(`Successfully ${isRetired ? 'activated' : 'retired'} ${name}.`)
        fetchPlayers()
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Failed to update player status: ${e.message}`)
    }
  }

  // Excel export function - export ALL footballplayer data
  const handleExportToExcel = async () => {
    try {
      setIsExporting(true)
      setShowExportModal(false)

      console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Starting full footballplayer database export...')

      // Fetch ALL players without pagination but with sold filter
      let apiUrl = '/api/players?limit=10000'
      if (exportSoldFilter === 'sold') {
        apiUrl += '&is_sold=true'
      } else if (exportSoldFilter === 'unsold') {
        apiUrl += '&is_sold=false'
      }

      const response = await fetch(apiUrl)
      const { data: allPlayers, success } = await response.json()

      if (!success || !allPlayers || allPlayers.length === 0) {
        showAlert({
          type: 'info',
          title: 'No Data',
          message: 'No players found in database for export'
        })
        return
      }

      // Dynamically import ExcelJS
      const ExcelJS = (await import('exceljs')).default

      // Create workbook
      const workbook = new ExcelJS.Workbook()

      // Define column structure for reuse across sheets
      const getColumnsDefinition = () => [
        // Basic Info
        { header: 'Player ID', key: 'player_id', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Position', key: 'position', width: 12 },
        { header: 'Position Group', key: 'position_group', width: 15 },
        { header: 'Overall Rating', key: 'overall_rating', width: 15 },
        { header: 'Age', key: 'age', width: 10 },
        { header: 'Nationality', key: 'nationality', width: 15 },
        { header: 'Club', key: 'club', width: 20 },
        { header: 'Team Name', key: 'team_name', width: 20 },
        { header: 'Auction Eligible', key: 'is_auction_eligible', width: 15 },
        { header: 'Is Sold', key: 'is_sold', width: 10 },
        { header: 'Acquisition Value', key: 'acquisition_value', width: 15 },
        { header: 'Playing Style', key: 'playing_style', width: 15 },

        // Offensive Attributes
        { header: 'Offensive Awareness', key: 'offensive_awareness', width: 18 },
        { header: 'Ball Control', key: 'ball_control', width: 15 },
        { header: 'Dribbling', key: 'dribbling', width: 12 },
        { header: 'Tight Possession', key: 'tight_possession', width: 15 },
        { header: 'Low Pass', key: 'low_pass', width: 12 },
        { header: 'Lofted Pass', key: 'lofted_pass', width: 12 },
        { header: 'Finishing', key: 'finishing', width: 12 },
        { header: 'Heading', key: 'heading', width: 12 },
        { header: 'Set Piece Taking', key: 'set_piece_taking', width: 15 },
        { header: 'Curl', key: 'curl', width: 10 },

        // Physical Attributes
        { header: 'Speed', key: 'speed', width: 10 },
        { header: 'Acceleration', key: 'acceleration', width: 12 },
        { header: 'Kicking Power', key: 'kicking_power', width: 12 },
        { header: 'Jumping', key: 'jumping', width: 12 },
        { header: 'Physical Contact', key: 'physical_contact', width: 15 },
        { header: 'Balance', key: 'balance', width: 12 },
        { header: 'Stamina', key: 'stamina', width: 12 },

        // Defensive Attributes
        { header: 'Defensive Awareness', key: 'defensive_awareness', width: 18 },
        { header: 'Tackling', key: 'tackling', width: 12 },
        { header: 'Aggression', key: 'aggression', width: 12 },
        { header: 'Defensive Engagement', key: 'defensive_engagement', width: 18 },

        // Goalkeeper Attributes
        { header: 'GK Awareness', key: 'gk_awareness', width: 12 },
        { header: 'GK Catching', key: 'gk_catching', width: 12 },
        { header: 'GK Parrying', key: 'gk_parrying', width: 12 },
        { header: 'GK Reflexes', key: 'gk_reflexes', width: 12 },
        { header: 'GK Reach', key: 'gk_reach', width: 12 },
      ].filter(col => selectedExportColumns.includes(col.key))

      // Function to get player row data
      const getPlayerRowData = (player: any) => ({
        // Basic Info
        player_id: player.player_id || '',
        name: player.name || '',
        position: player.position || '',
        position_group: player.position_group || '',
        overall_rating: player.overall_rating || 0,
        age: player.age || 0,
        nationality: player.nationality || '',
        club: player.club || '',
        team_name: player.team_name || '',
        is_auction_eligible: player.is_auction_eligible ? 'Yes' : 'No',
        is_sold: player.is_sold ? 'Yes' : 'No',
        acquisition_value: player.acquisition_value || 0,
        playing_style: player.playing_style || '',

        // Offensive Attributes
        offensive_awareness: player.offensive_awareness || 0,
        ball_control: player.ball_control || 0,
        dribbling: player.dribbling || 0,
        tight_possession: player.tight_possession || 0,
        low_pass: player.low_pass || 0,
        lofted_pass: player.lofted_pass || 0,
        finishing: player.finishing || 0,
        heading: player.heading || 0,
        set_piece_taking: player.set_piece_taking || 0,
        curl: player.curl || 0,

        // Physical Attributes
        speed: player.speed || 0,
        acceleration: player.acceleration || 0,
        kicking_power: player.kicking_power || 0,
        jumping: player.jumping || 0,
        physical_contact: player.physical_contact || 0,
        balance: player.balance || 0,
        stamina: player.stamina || 0,

        // Defensive Attributes
        defensive_awareness: player.defensive_awareness || 0,
        tackling: player.tackling || 0,
        aggression: player.aggression || 0,
        defensive_engagement: player.defensive_engagement || 0,

        // Goalkeeper Attributes
        gk_awareness: player.gk_awareness || 0,
        gk_catching: player.gk_catching || 0,
        gk_parrying: player.gk_parrying || 0,
        gk_reflexes: player.gk_reflexes || 0,
        gk_reach: player.gk_reach || 0,
      })

      // Function to style a worksheet
      const styleWorksheet = (worksheet: any, players: any[]) => {
        // Set columns
        worksheet.columns = getColumnsDefinition()

        // Style header row (Gold theme to match retro look)
        worksheet.getRow(1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF59E0B' } // Amber-500 color matching our buttons
        }
        worksheet.getRow(1).height = 25

        // Add data rows
        players.forEach((player, index) => {
          const rowData = getPlayerRowData(player)
          const row = worksheet.addRow(rowData)

          // Alternate row colors
          if (index % 2 === 1) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            }
          }

          // Style auction eligible column if it exists in the output definition
          if (selectedExportColumns.includes('is_auction_eligible')) {
            const eligibleCell = row.getCell('is_auction_eligible')
            if (player.is_auction_eligible) {
              eligibleCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD4EDDA' }
              }
              eligibleCell.font = { color: { argb: 'FF155724' } }
            } else {
              eligibleCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8D7DA' }
              }
              eligibleCell.font = { color: { argb: 'FF721C24' } }
            }
          }
        })
      }

      // Filter targeted positions based on user selections
      const targets = EXPORT_POSITIONS_AND_GROUPS.filter(t => selectedExportPositions.includes(t.label))

      // If individual mode is selected, generate and package separate single-sheet workbooks into a ZIP
      if (exportMode === 'individual') {
        const initJSZip = async () => {
          const script = document.createElement('script')
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
          document.head.appendChild(script)
          
          return new Promise<any>((resolve) => {
            script.onload = () => {
              // @ts-expect-error - External library type issue
              resolve(window.JSZip)
            }
          })
        }

        // @ts-expect-error - External library type issue
        let JSZipLib = window.JSZip
        if (!JSZipLib) {
          JSZipLib = await initJSZip()
        }
        const zip = new JSZipLib()

        let individualCount = 0
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i]
          const matchingPlayers = allPlayers.filter((p: any) => {
            if (target.type === 'position') {
              return p.position === target.name
            } else {
              return p.position_group === target.name
            }
          })

          if (matchingPlayers.length > 0) {
            const singleWorkbook = new ExcelJS.Workbook()
            const singleSheetName = `${target.label}`
            const worksheet = singleWorkbook.addWorksheet(singleSheetName)
            styleWorksheet(worksheet, matchingPlayers)

            const singleBuffer = await singleWorkbook.xlsx.writeBuffer()
            // Add file to ZIP
            zip.file(`Players-${target.label}-${new Date().toISOString().split('T')[0]}.xlsx`, singleBuffer)
            individualCount++
          }
        }

        if (individualCount > 0) {
          const zipContent = await zip.generateAsync({ type: 'blob' })
          const fileUrl = window.URL.createObjectURL(zipContent)
          const a = document.createElement('a')
          a.href = fileUrl
          a.download = `Football-Players-Individual-Excels-${new Date().toISOString().split('T')[0]}.zip`
          a.click()
          window.URL.revokeObjectURL(fileUrl)
        }

        showAlert({
          type: 'success',
          title: 'Export Successful',
          message: `✅ Packaged ${individualCount} positions into a single ZIP file successfully!`
        })
        return
      }

      let createdSheetsCount = 0
      const sheetNameDetails: string[] = []

      // Create position/group specific sheets in order
      targets.forEach(target => {
        const matchingPlayers = allPlayers.filter((p: any) => {
          if (target.type === 'position') {
            return p.position === target.name
          } else {
            return p.position_group === target.name
          }
        })

        if (matchingPlayers.length > 0) {
          const sheetName = `${target.label} (${matchingPlayers.length})`
          const worksheet = workbook.addWorksheet(sheetName)
          styleWorksheet(worksheet, matchingPlayers)
          createdSheetsCount++
          sheetNameDetails.push(sheetName)
          console.log(`✅ Created sheet: ${sheetName}`)
        }
      })

      // Create "All Players" overview sheet
      const allPlayersSheet = workbook.addWorksheet(`All Players (${allPlayers.length})`)
      styleWorksheet(allPlayersSheet, allPlayers)
      createdSheetsCount++

      // Add summary sheet
      const summarySheet = workbook.addWorksheet('Summary')
      createdSheetsCount++

      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
      ]

      // Summary data
      const totalPlayers = allPlayers.length
      const eligiblePlayers = allPlayers.filter((p: any) => p.is_auction_eligible).length
      const soldPlayers = allPlayers.filter((p: any) => p.is_sold).length
      const targetCounts = targets.map(target => {
        const matchingPlayers = allPlayers.filter((p: any) => {
          if (target.type === 'position') {
            return p.position === target.name
          } else {
            return p.position_group === target.name
          }
        })
        return {
          label: target.label,
          type: target.type,
          count: matchingPlayers.length
        }
      }).filter(t => t.count > 0)

      const positionCounts = targetCounts.filter(t => t.type === 'position')
      const positionGroupCounts = targetCounts.filter(t => t.type === 'group')

      const summaryData = [
        { metric: 'Total Players', value: totalPlayers },
        { metric: 'Auction Eligible', value: eligiblePlayers },
        { metric: 'Sold Players', value: soldPlayers },
        { metric: 'Available Players', value: eligiblePlayers - soldPlayers },
        { metric: '', value: '' }, // Empty row
        { metric: 'WORKSHEETS CREATED', value: '' },
        { metric: 'Position Sheets', value: positionCounts.length },
        { metric: 'Position Group Sheets', value: positionGroupCounts.length },
        { metric: 'Total Sheets', value: createdSheetsCount },
        { metric: '', value: '' }, // Empty row
        { metric: 'POSITION BREAKDOWN', value: '' },
        ...positionCounts.map(({ label, count }) => ({
          metric: `${label} Players`,
          value: count
        })),
        { metric: '', value: '' }, // Empty row
        { metric: 'POSITION GROUP BREAKDOWN', value: '' },
        ...positionGroupCounts.map(({ label, count }) => ({
          metric: `${label} Group`,
          value: count
        }))
      ]

      summaryData.forEach((item) => {
        const row = summarySheet.addRow(item)
        // Style section headers (Gold color)
        if (item.metric.includes('BREAKDOWN') || item.metric === 'WORKSHEETS CREATED') {
          row.font = { bold: true, color: { argb: 'FFF59E0B' } }
        }
      })

      // Style summary sheet
      summarySheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
      summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF59E0B' }
      }

      // Generate Excel file buffer
      const buffer = await workbook.xlsx.writeBuffer()

      // Download
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Football-Players-Database-${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)

      const positionSheetNames = positionCounts.map(({ label, count }) => `${label} (${count})`).join(', ')
      const groupSheetNames = positionGroupCounts.map(({ label, count }) => `${label} (${count})`).join(', ')

      showAlert({
        type: 'success',
        title: 'Export Successful',
        message: `✅ Exported complete footballplayer database to Excel!\n\n📊 ORGANIZED INTO ${createdSheetsCount} WORKSHEETS:\n\n🏃 POSITION SHEETS (${positionCounts.length}):\n${positionSheetNames}\n\n📋 POSITION GROUP SHEETS (${positionGroupCounts.length}):\n${groupSheetNames}\n\n📈 OVERVIEW SHEETS:\n• All Players (${totalPlayers})\n• Summary & Statistics\n\n💫 FEATURES:\n• Selected columns exported (${selectedExportColumns.length}/${ALL_EXPORT_COLUMN_KEYS.length})\n• Arranged in customized position order\n• Color-coded auction eligibility\n• Professional formatting`
      })
    } catch (err) {
      console.error('Error exporting:', err)
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export data. Please try again.'
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Memoized calculations for performance
  const positions = useMemo(() =>
    ['', ...new Set(players.map(p => p.position).filter(Boolean))],
    [players]
  )

  const totalPages = useMemo(() =>
    Math.ceil(totalPlayers / PLAYERS_PER_PAGE),
    [totalPlayers]
  )

  // Use filtered players directly (already paginated from server)
  const paginatedPlayers = filteredPlayers

  const getRatingColor = (rating?: number) => {
    if (!rating) return 'bg-slate-50 text-slate-400 border border-slate-200/30'
    if (rating >= 85) return 'bg-green-50/60 text-green-700 border border-green-200/30 font-bold'
    if (rating >= 75) return 'bg-blue-50/60 text-blue-700 border border-blue-200/30 font-bold'
    if (rating >= 65) return 'bg-amber-50/60 text-amber-700 border border-amber-200/30 font-bold'
    return 'bg-slate-50/60 text-slate-700 border border-slate-200/30 font-bold'
  }

  if (authLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading player management...</p>
        </div>
      </div>
    )
  }

  // Show loading skeleton on initial load
  if (initialLoad && loading) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
          <div className="console-card bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 animate-pulse">
            <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100">
              <div className="h-8 bg-slate-100 rounded-lg w-48 animate-pulse"></div>
              <div className="h-10 bg-slate-100 rounded-lg w-32 animate-pulse"></div>
            </div>

            <div className="mb-4">
              <div className="h-11 bg-slate-50 border border-slate-200/60 rounded-xl animate-pulse mb-3"></div>
              <div className="flex gap-2">
                <div className="h-11 bg-slate-50 border border-slate-200/60 rounded-xl flex-1 animate-pulse"></div>
                <div className="h-11 bg-slate-50 border border-slate-200/60 rounded-xl flex-1 animate-pulse"></div>
                <div className="h-11 bg-slate-50 border border-slate-200/60 rounded-xl w-24 animate-pulse"></div>
              </div>
            </div>

            <div className="mb-4 p-3 bg-slate-50 border border-slate-200/40 rounded-xl">
              <div className="h-5 bg-slate-100 rounded w-64 animate-pulse"></div>
            </div>

            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-slate-50/50 rounded-lg p-4 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="h-6 bg-slate-100 rounded flex-1"></div>
                    <div className="h-6 bg-slate-100 rounded w-16"></div>
                    <div className="h-6 bg-slate-100 rounded w-16"></div>
                    <div className="h-6 bg-slate-100 rounded w-24"></div>
                    <div className="h-6 bg-slate-100 rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Header and Controls */}
        <div className="console-card bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-6 border-b border-slate-100">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {eligibilityFilter === 'eligible' ? 'Auction Eligible Players' : 'All Players'}
              </h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-1">
                Total Registered Database: <span className="font-extrabold text-amber-500">{totalPlayers}</span>
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowExportModal(true)}
                disabled={isExporting}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-wider disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export Excel</span>
                  </>
                )}
              </button>
              
              <Link
                href="/dashboard/committee"
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-350 text-slate-700 font-bold rounded-xl transition-all shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-wider"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Dashboard</span>
              </Link>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col gap-4">
            <div className="relative w-full">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Player Name, ID..."
                className="pl-10 w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-bold uppercase tracking-wider"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-bold uppercase tracking-wider appearance-none"
                >
                  <option value="">All Positions</option>
                  {positions.filter(p => p).map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="flex-1 relative">
                <select
                  value={eligibilityFilter}
                  onChange={(e) => setEligibilityFilter(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-bold uppercase tracking-wider appearance-none"
                >
                  <option value="all">All Active Players</option>
                  <option value="eligible">Eligible Active Players</option>
                  <option value="retired">Retired Players</option>
                  <option value="all_with_retired">All (Inc. Retired)</option>
                </select>
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchPlayers}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-wider text-center"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex items-center justify-between font-mono text-[10px] uppercase font-bold text-slate-500 shadow-sm">
          <span>
            Showing <strong className="text-slate-800">{((currentPage - 1) * PLAYERS_PER_PAGE) + 1}</strong> to <strong className="text-slate-800">{Math.min(currentPage * PLAYERS_PER_PAGE, (currentPage - 1) * PLAYERS_PER_PAGE + filteredPlayers.length)}</strong> of <strong className="text-slate-800">{totalPlayers}</strong> players
          </span>
          {totalPages > 1 && (
            <span className="text-slate-450">Page {currentPage} of {totalPages}</span>
          )}
        </div>

        {/* Mobile Cards (hidden on desktop) */}
        <div className="block sm:hidden">
          {loading && !initialLoad ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="console-card bg-white border border-slate-200/60 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-3/4 mb-3 animate-pulse"></div>
                  <div className="h-3 bg-slate-100 rounded w-1/2 animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : paginatedPlayers.length === 0 ? (
            <div className="console-card bg-white rounded-2xl p-12 text-center border border-slate-200/60 font-mono">
              <svg className="w-12 h-12 mx-auto text-slate-350 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-sm font-bold text-slate-850 uppercase tracking-wider mb-1">No players found</h3>
              <p className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Try adjusting your filters or search term</p>
            </div>
          ) : (
            <div className="grid gap-4 font-mono">
              {paginatedPlayers.map((player) => (
                <div key={player.id} className="console-card bg-white rounded-xl p-4 border border-slate-200/60 hover:bg-slate-50/50 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-extrabold text-slate-800 text-sm truncate uppercase tracking-wide">{player.name}</h3>
                        {player.retired ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-slate-700 text-white border border-slate-650 uppercase tracking-wider">
                            RET
                          </span>
                        ) : (
                          player.is_auction_eligible && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-green-50 text-green-700 border border-green-200/30 uppercase tracking-wider">
                              ELG
                            </span>
                          )
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="font-bold text-slate-500 uppercase">{player.position || 'N/A'}</span>
                        {player.position_group && (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/30 font-bold uppercase tracking-wider">
                            {player.position_group}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getRatingColor(player.overall_rating)}`}>
                          OVR: {player.overall_rating || '--'}
                        </span>
                      </div>
                      
                      {player.team ? (
                        <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-2 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          Team: {player.team.name}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-2 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
                          Free Agent
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 ml-2">
                      <Link
                        href={`/dashboard/committee/players/${player.id}`}
                        className="p-2 rounded-xl bg-slate-50 hover:bg-amber-500 hover:text-white border border-slate-200/60 text-slate-600 transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                        title="View Details"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggleRetired(player.id, player.name, player.retired)}
                        className={`p-2 rounded-xl border transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm ${
                          player.retired
                            ? 'bg-emerald-50 border-emerald-250 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                            : 'bg-orange-50 border-orange-250 text-orange-600 hover:bg-orange-500 hover:text-white'
                        }`}
                        title={player.retired ? 'Activate Player' : 'Retire Player'}
                      >
                        {player.retired ? '♻️' : '💤'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(player.id)}
                        className="p-2 rounded-xl bg-slate-50 hover:bg-rose-500 hover:text-white border border-slate-200/60 text-rose-600 transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                        title="Delete Player"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Table (hidden on mobile) */}
        <div className="hidden sm:block console-card bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/60 text-[10px] uppercase font-black tracking-wider text-slate-500 font-mono">
                <th className="p-4 w-2/5">Player</th>
                <th className="p-4 w-1/5">Position</th>
                <th className="p-4 w-1/5">Overall</th>
                <th className="p-4 w-1/5 hidden md:table-cell">Team</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
              {loading && !initialLoad ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center font-mono">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                    </div>
                  </td>
                </tr>
              ) : paginatedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center font-mono text-slate-400 uppercase tracking-wider font-bold">
                    No players found
                  </td>
                </tr>
              ) : (
                paginatedPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-slate-50/[0.1] transition-colors font-mono">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">{player.name}</span>
                        {player.retired ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-extrabold bg-slate-700 text-white border border-slate-650 uppercase tracking-wider">
                            Retired
                          </span>
                        ) : (
                          player.is_auction_eligible && (
                            <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-extrabold bg-green-50 text-green-700 border border-green-200/30 uppercase tracking-wider">
                              Eligible
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-500 uppercase">
                      {player.position || 'N/A'}
                      {player.position_group && (
                        <span className="ml-2 px-2 py-0.5 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200/30 font-bold uppercase tracking-wider">
                          {player.position_group}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getRatingColor(player.overall_rating)}`}>
                        {player.overall_rating || '--'}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-700 uppercase hidden md:table-cell">
                      {player.team ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          <span>{player.team.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-bold uppercase">Free Agent</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/dashboard/committee/players/${player.id}`}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-amber-500 hover:text-white border border-slate-200/60 text-slate-600 transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                          title="View Details"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleToggleRetired(player.id, player.name, player.retired)}
                          className={`p-1.5 rounded-lg border transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm ${
                            player.retired
                              ? 'bg-emerald-50 border-emerald-250 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                              : 'bg-orange-50 border-orange-250 text-orange-600 hover:bg-orange-500 hover:text-white'
                          }`}
                          title={player.retired ? 'Activate Player' : 'Retire Player'}
                        >
                          {player.retired ? '♻️' : '💤'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(player.id)}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-500 hover:text-white border border-slate-200/60 text-rose-600 transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
                          title="Delete Player"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs">
            <div className="text-slate-500 uppercase font-bold tracking-wider">
              Showing <strong>{((currentPage - 1) * PLAYERS_PER_PAGE) + 1}</strong> to <strong>{Math.min(currentPage * PLAYERS_PER_PAGE, (currentPage - 1) * PLAYERS_PER_PAGE + filteredPlayers.length)}</strong> of <strong>{totalPlayers}</strong> players
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:border-slate-350 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px]"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:border-slate-350 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px]"
              >
                Prev
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-2.5 py-1.5 rounded-lg font-bold text-[10px] transition-all border ${currentPage === pageNum
                        ? 'bg-amber-500 border-amber-600 text-white shadow-sm'
                        : 'bg-white border-slate-250/60 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:border-slate-350 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px]"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:border-slate-350 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px]"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Components */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
      />

      {/* Export Filter Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="console-card bg-white rounded-2xl p-6 md:p-8 max-w-3xl w-full max-h-[90vh] shadow-2xl border border-slate-200/60 font-mono flex flex-col">
            <h3 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Players to Excel
            </h3>
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-6 tracking-wide">
              Customize sheets, player selection, and column configuration:
            </p>

            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
              {/* Left Column: Radio Filters & Summary */}
              <div className="md:col-span-2 space-y-4">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  1. Filter Players
                </div>
                <div className="space-y-2">
                  <label 
                    className="flex items-center p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50/50 transition-all text-xs"
                    style={{ borderColor: exportSoldFilter === 'all' ? '#F59E0B' : '#E2E8F0', borderWidth: exportSoldFilter === 'all' ? '2px' : '1px' }}
                  >
                    <input
                      type="radio"
                      name="exportFilter"
                      value="all"
                      checked={exportSoldFilter === 'all'}
                      onChange={(e) => setExportSoldFilter(e.target.value as 'all' | 'sold' | 'unsold')}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300"
                    />
                    <span className="ml-2.5 font-extrabold text-slate-700 uppercase">All Players</span>
                  </label>

                  <label 
                    className="flex items-center p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50/50 transition-all text-xs"
                    style={{ borderColor: exportSoldFilter === 'sold' ? '#F59E0B' : '#E2E8F0', borderWidth: exportSoldFilter === 'sold' ? '2px' : '1px' }}
                  >
                    <input
                      type="radio"
                      name="exportFilter"
                      value="sold"
                      checked={exportSoldFilter === 'sold'}
                      onChange={(e) => setExportSoldFilter(e.target.value as 'all' | 'sold' | 'unsold')}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300"
                    />
                    <span className="ml-2.5 font-extrabold text-slate-700 uppercase">Sold Players Only</span>
                  </label>

                  <label 
                    className="flex items-center p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50/50 transition-all text-xs"
                    style={{ borderColor: exportSoldFilter === 'unsold' ? '#F59E0B' : '#E2E8F0', borderWidth: exportSoldFilter === 'unsold' ? '2px' : '1px' }}
                  >
                    <input
                      type="radio"
                      name="exportFilter"
                      value="unsold"
                      checked={exportSoldFilter === 'unsold'}
                      onChange={(e) => setExportSoldFilter(e.target.value as 'all' | 'sold' | 'unsold')}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300"
                    />
                    <span className="ml-2.5 font-extrabold text-slate-700 uppercase">Unsold Players Only</span>
                  </label>
                </div>

                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider pt-2">
                  3. Export Format
                </div>
                <div className="space-y-2">
                  <label 
                    className="flex items-center p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50/50 transition-all text-xs"
                    style={{ borderColor: exportMode === 'combined' ? '#F59E0B' : '#E2E8F0', borderWidth: exportMode === 'combined' ? '2px' : '1px' }}
                  >
                    <input
                      type="radio"
                      name="exportMode"
                      value="combined"
                      checked={exportMode === 'combined'}
                      onChange={() => setExportMode('combined')}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300"
                    />
                    <div className="ml-2.5">
                      <span className="font-extrabold text-slate-700 uppercase block">Combined Excel</span>
                      <span className="text-[9px] text-slate-400 font-mono">Single file with multiple sheets</span>
                    </div>
                  </label>

                  <label 
                    className="flex items-center p-2.5 border rounded-xl cursor-pointer hover:bg-slate-50/50 transition-all text-xs"
                    style={{ borderColor: exportMode === 'individual' ? '#F59E0B' : '#E2E8F0', borderWidth: exportMode === 'individual' ? '2px' : '1px' }}
                  >
                    <input
                      type="radio"
                      name="exportMode"
                      value="individual"
                      checked={exportMode === 'individual'}
                      onChange={() => setExportMode('individual')}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-500 border-slate-300"
                    />
                    <div className="ml-2.5">
                      <span className="font-extrabold text-slate-700 uppercase block">Individual Excels</span>
                      <span className="text-[9px] text-slate-400 font-mono">One file per position (batch download)</span>
                    </div>
                  </label>
                </div>

                <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 text-[10px] text-amber-900 leading-normal space-y-1">
                  <div className="font-bold uppercase tracking-wider mb-1">Sheet Ordering Info:</div>
                  <p>Sheets will be auto-generated in the targeted order:</p>
                  <p className="font-bold text-[9px] text-amber-800">GK, LB, RB, CB, CB-1, CB-2, DMF, DMF-1, DMF-2, CMF, CMF-1, CMF-2, AMF, AMF-1, AMF-2, LMF, RMF, LWF, RWF, SS, CF, CF-1, CF-2, All Players, Summary.</p>
                </div>
              </div>

              {/* Right Column: Columns & Positions Selector */}
              <div className="md:col-span-3 flex flex-col space-y-4">
                {/* 2. Select Positions */}
                <div className="flex flex-col space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      2. Select Positions ({selectedExportPositions.length}/{EXPORT_POSITIONS_AND_GROUPS.length})
                    </span>
                    <div className="flex gap-2 text-[9px] font-bold uppercase">
                      <button
                        onClick={() => setSelectedExportPositions(EXPORT_POSITIONS_AND_GROUPS.map(p => p.label))}
                        className="text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => setSelectedExportPositions([])}
                        className="text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  
                  {/* Grid of Position Badges */}
                  <div className="flex flex-wrap gap-1.5 p-2.5 border border-slate-200 rounded-xl bg-slate-50/50 max-h-[105px] overflow-y-auto">
                    {EXPORT_POSITIONS_AND_GROUPS.map((p, idx) => {
                      const isSelected = selectedExportPositions.includes(p.label);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedExportPositions(prev => 
                              prev.includes(p.label) 
                                ? prev.filter(x => x !== p.label) 
                                : [...prev, p.label]
                            )
                          }}
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-amber-500 border-amber-600 text-slate-950 font-black font-mono shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Select Columns */}
                <div className="flex flex-col space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      3. Select Columns ({selectedExportColumns.length}/{ALL_EXPORT_COLUMN_KEYS.length})
                    </span>
                    <div className="flex gap-2 text-[9px] font-bold uppercase">
                      <button
                        onClick={() => setSelectedExportColumns(ALL_EXPORT_COLUMN_KEYS)}
                        className="text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() => setSelectedExportColumns(['player_id', 'name', 'position'])}
                        className="text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Checklist Container */}
                  <div className="max-h-[175px] overflow-y-auto pr-1 border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-4">
                    {EXPORT_COLUMN_CATEGORIES.map((cat, catIdx) => {
                      const catKeys = cat.columns.map(col => col.key);
                      const isAllCatChecked = catKeys.every(k => selectedExportColumns.includes(k));
                      
                      return (

                        <div key={catIdx} className="space-y-1.5">
                          <div className="flex justify-between items-center border-b border-slate-200/60 pb-1 mb-1">
                            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                              {cat.name}
                            </span>
                            <button
                              onClick={() => {
                                if (isAllCatChecked) {
                                  setSelectedExportColumns(prev => prev.filter(k => !catKeys.includes(k)));
                                } else {
                                  setSelectedExportColumns(prev => [...new Set([...prev, ...catKeys])]);
                                }
                              }}
                              className="text-[8px] font-bold text-amber-500 hover:text-amber-600 uppercase"
                            >
                              {isAllCatChecked ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            {cat.columns.map((col, colIdx) => (
                              <label key={colIdx} className="flex items-center text-[10px] text-slate-600 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={selectedExportColumns.includes(col.key)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedExportColumns(prev => [...prev, col.key]);
                                    } else {
                                      setSelectedExportColumns(prev => prev.filter(k => k !== col.key));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500 border-slate-300"
                                />
                                <span className="ml-1.5 truncate font-medium">{col.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

  );
                    })}
                  </div>
                </div>
              </div>
            </div>
            </div>

            <div className="flex gap-3 flex-shrink-0 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-bold uppercase tracking-wider text-xs text-center"
              >
                Cancel
              </button>
              <button
                onClick={handleExportToExcel}
                disabled={selectedExportColumns.length === 0 || selectedExportPositions.length === 0}
                className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-xl transition-all shadow-sm font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export ({selectedExportColumns.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  
    </AuthGuard>
  )
}
