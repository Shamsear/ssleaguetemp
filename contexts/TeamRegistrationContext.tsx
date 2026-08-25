'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';


interface TeamRegistrationContextType {
  isRegistered: boolean;
  setIsRegistered: (registered: boolean) => void;
  teamLogo: string | null;
  teamId: string | null;
}

const TeamRegistrationContext = createContext<TeamRegistrationContextType>({
  isRegistered: true, // Default to true to avoid hiding menu during initial load
  setIsRegistered: () => {},
  teamLogo: null,
  teamId: null,
});

export function TeamRegistrationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isRegistered, setIsRegistered] = useState(true);
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  // Reset to true when user changes (to avoid hiding menu during loading)
  useEffect(() => {
    if (!user || user.role !== 'team') {
      setIsRegistered(true); // Non-team users always see full menu
      setTeamLogo(null);
      setTeamId(null);
    }
  }, [user]);

  // Fetch team data (logo and ID) for team users
  useEffect(() => {
    const fetchTeamData = async () => {
      if (user && user.role === 'team') {
        try {
          const teamsJson = await (await fetch('/api/teams')).json();
          const teamsList = teamsJson.teams || teamsJson.data || [];
          const teamDoc = teamsList.find((t: any) => t.userId === user.uid || t.uid === user.uid || t.owner_uid === user.uid);
          
          if (teamDoc) {
            // Set team ID
            setTeamId(teamDoc.id);
            
            // Set team logo
            if (teamDoc.logo_url) {
              setTeamLogo(teamDoc.logo_url);
            } else if (teamDoc.team_logo) {
              setTeamLogo(teamDoc.team_logo);
            }
          }
        } catch (error) {
          console.error('[TeamRegistrationContext] Error fetching team data:', error);
        }
      }
    };
    
    fetchTeamData();
  }, [user]);

  return (
    <TeamRegistrationContext.Provider value={{ isRegistered, setIsRegistered, teamLogo, teamId }}>
      {children}
    </TeamRegistrationContext.Provider>
  );
}

export function useTeamRegistration() {
  return useContext(TeamRegistrationContext);
}
