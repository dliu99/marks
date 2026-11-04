import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';

type WhatIfModification = {
  score?: string | null;
  totalPoints?: number | null;
  dropped?: boolean;
};

export type VirtualCategory = {
  groupID: number;
  name: string;
  weight: number;
};

export type VirtualAssignment = {
  objectSectionID: number;
  groupID: number;
  assignmentName: string;
  score: string;
  totalPoints: number;
  dropped?: boolean;
};

type WhatIfContextType = {
  modifications: Map<number, WhatIfModification>;
  virtualCategories: VirtualCategory[];
  virtualAssignments: VirtualAssignment[];
  editGrade: (objectSectionID: number, score: string | null) => void;
  editTotalPoints: (objectSectionID: number, totalPoints: string | null) => void;
  toggleDrop: (objectSectionID: number, currentDropped: boolean) => void;
  resetAssignment: (objectSectionID: number) => void;
  resetCategory: (groupID: number, objectSectionIDs: number[]) => void;
  resetAll: () => void;
  addingCategory: boolean;
  addingToGroupID: number | null;
  addCategory: (name: string, weight: number) => void;
  addAssignment: (
    groupID: number,
    score: string,
    totalPoints: number,
    assignmentName?: string
  ) => void;
  removeVirtualCategory: (groupID: number) => void;
  removeVirtualAssignment: (objectSectionID: number) => void;
  removeVirtualAssignmentsForCategory: (groupID: number) => void;
  openAddCategorySheet: () => void;
  closeAddCategorySheet: () => void;
  openAddSheet: (groupID: number) => void;
  closeAddSheet: () => void;
  addCategorySheetRef: React.RefObject<BottomSheet | null>;
  addSheetRef: React.RefObject<BottomSheet | null>;
  getVirtualAssignmentCount: (groupID: number) => number;
  renameVirtualAssignment: (objectSectionID: number, newName: string) => void;
};

const WhatIfContext = createContext<WhatIfContextType | null>(null);

export function WhatIfProvider({ children }: { children: ReactNode }) {
  const [modifications, setModifications] = useState<Map<number, WhatIfModification>>(new Map());
  const [virtualCategories, setVirtualCategories] = useState<VirtualCategory[]>([]);
  const [virtualAssignments, setVirtualAssignments] = useState<VirtualAssignment[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingToGroupID, setAddingToGroupID] = useState<number | null>(null);
  const nextVirtualCategoryIDRef = useRef(-1);
  const nextVirtualAssignmentIDRef = useRef(-1);
  const addCategorySheetRef = useRef<BottomSheet>(null);
  const addSheetRef = useRef<BottomSheet>(null);

  const editGrade = useCallback((objectSectionID: number, score: string | null) => {
    if (objectSectionID < 0) {
      setVirtualAssignments((prev) =>
        prev.map((a) => (a.objectSectionID === objectSectionID ? { ...a, score: score ?? '0' } : a))
      );
    } else {
      setModifications((prev) => {
        const next = new Map(prev);
        const existing = next.get(objectSectionID) || {};
        next.set(objectSectionID, { ...existing, score });
        return next;
      });
    }
  }, []);

  const editTotalPoints = useCallback((objectSectionID: number, totalPoints: string | null) => {
    const parsedTotalPoints = totalPoints === null ? null : Number.parseFloat(totalPoints.trim());

    if (objectSectionID < 0) {
      if (
        !Number.isFinite(parsedTotalPoints) ||
        parsedTotalPoints === null ||
        parsedTotalPoints < 0
      ) {
        return;
      }

      setVirtualAssignments((prev) =>
        prev.map((a) =>
          a.objectSectionID === objectSectionID ? { ...a, totalPoints: parsedTotalPoints } : a
        )
      );
      return;
    }

    setModifications((prev) => {
      const next = new Map(prev);
      const existing = next.get(objectSectionID) || {};
      const normalizedTotalPoints =
        Number.isFinite(parsedTotalPoints) && parsedTotalPoints !== null && parsedTotalPoints >= 0
          ? parsedTotalPoints
          : undefined;
      const updated = { ...existing, totalPoints: normalizedTotalPoints };

      if (
        updated.score === undefined &&
        updated.totalPoints === undefined &&
        updated.dropped === undefined
      ) {
        next.delete(objectSectionID);
      } else {
        next.set(objectSectionID, updated);
      }
      return next;
    });
  }, []);

  const toggleDrop = useCallback((objectSectionID: number, currentDropped: boolean) => {
    if (objectSectionID < 0) {
      setVirtualAssignments((prev) =>
        prev.map((a) =>
          a.objectSectionID === objectSectionID ? { ...a, dropped: !currentDropped } : a
        )
      );
    } else {
      setModifications((prev) => {
        const next = new Map(prev);
        const existing = next.get(objectSectionID) || {};
        next.set(objectSectionID, { ...existing, dropped: !currentDropped });
        return next;
      });
    }
  }, []);

  const resetAssignment = useCallback((objectSectionID: number) => {
    if (objectSectionID < 0) {
      setVirtualAssignments((prev) =>
        prev.filter((assignment) => assignment.objectSectionID !== objectSectionID)
      );
      return;
    }

    setModifications((prev) => {
      const next = new Map(prev);
      next.delete(objectSectionID);
      return next;
    });
  }, []);

  const resetCategory = useCallback((groupID: number, objectSectionIDs: number[]) => {
    setVirtualAssignments((prev) => prev.filter((assignment) => assignment.groupID !== groupID));

    setModifications((prev) => {
      if (objectSectionIDs.length === 0) {
        return prev;
      }

      const next = new Map(prev);
      for (const objectSectionID of objectSectionIDs) {
        next.delete(objectSectionID);
      }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setModifications(new Map());
    setVirtualCategories([]);
    setVirtualAssignments([]);
    setAddingCategory(false);
    setAddingToGroupID(null);
    addCategorySheetRef.current?.close();
    addSheetRef.current?.close();
  }, []);

  const getVirtualAssignmentCount = useCallback(
    (groupID: number) => {
      return virtualAssignments.filter((a) => a.groupID === groupID).length;
    },
    [virtualAssignments]
  );

  const addCategory = useCallback((name: string, weight: number) => {
    const nextGroupID = nextVirtualCategoryIDRef.current;
    nextVirtualCategoryIDRef.current -= 1;

    setVirtualCategories((prev) => [
      ...prev,
      {
        groupID: nextGroupID,
        name: name.trim(),
        weight,
      },
    ]);
  }, []);

  const addAssignment = useCallback(
    (groupID: number, score: string, totalPoints: number, assignmentName?: string) => {
      const count = virtualAssignments.filter((a) => a.groupID === groupID).length + 1;
      const nextObjectSectionID = nextVirtualAssignmentIDRef.current;
      nextVirtualAssignmentIDRef.current -= 1;
      const newAssignment: VirtualAssignment = {
        objectSectionID: nextObjectSectionID,
        groupID,
        assignmentName: assignmentName?.trim() || `My Assignment #${count}`,
        score,
        totalPoints,
      };
      setVirtualAssignments((prev) => [...prev, newAssignment]);
    },
    [virtualAssignments]
  );

  const removeVirtualCategory = useCallback((groupID: number) => {
    setVirtualCategories((prev) => prev.filter((category) => category.groupID !== groupID));
    setVirtualAssignments((prev) => prev.filter((assignment) => assignment.groupID !== groupID));
  }, []);

  const removeVirtualAssignment = useCallback((objectSectionID: number) => {
    setVirtualAssignments((prev) => prev.filter((a) => a.objectSectionID !== objectSectionID));
  }, []);

  const removeVirtualAssignmentsForCategory = useCallback((groupID: number) => {
    setVirtualAssignments((prev) => prev.filter((a) => a.groupID !== groupID));
  }, []);

  const openAddCategorySheet = useCallback(() => {
    setAddingCategory(true);
    addCategorySheetRef.current?.expand();
  }, []);

  const closeAddCategorySheet = useCallback(() => {
    addCategorySheetRef.current?.close();
    setAddingCategory(false);
  }, []);

  const openAddSheet = useCallback((groupID: number) => {
    setAddingToGroupID(groupID);
    addSheetRef.current?.expand();
  }, []);

  const closeAddSheet = useCallback(() => {
    addSheetRef.current?.close();
    setAddingToGroupID(null);
  }, []);

  const renameVirtualAssignment = useCallback((objectSectionID: number, newName: string) => {
    setVirtualAssignments((prev) =>
      prev.map((a) =>
        a.objectSectionID === objectSectionID ? { ...a, assignmentName: newName } : a
      )
    );
  }, []);

  return (
    <WhatIfContext.Provider
      value={{
        modifications,
        virtualCategories,
        virtualAssignments,
        editGrade,
        editTotalPoints,
        toggleDrop,
        resetAssignment,
        resetCategory,
        resetAll,
        addingCategory,
        addingToGroupID,
        addCategory,
        addAssignment,
        removeVirtualCategory,
        removeVirtualAssignment,
        removeVirtualAssignmentsForCategory,
        openAddCategorySheet,
        closeAddCategorySheet,
        openAddSheet,
        closeAddSheet,
        addCategorySheetRef,
        addSheetRef,
        getVirtualAssignmentCount,
        renameVirtualAssignment,
      }}>
      {children}
    </WhatIfContext.Provider>
  );
}

export function useWhatIf() {
  const context = useContext(WhatIfContext);
  if (!context) {
    throw new Error('useWhatIf must be used within a WhatIfProvider');
  }
  return context;
}
